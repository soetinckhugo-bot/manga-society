-- ============================================================================
-- MANGA SOCIETY — RPC profil public + username + vitrine (migration additive
-- 0007, Agent A). Voir MIGRATIONS.md.
--
-- MOTIF (intégration Agent B, bloquante pour onboarding + /u/[username]) :
-- le schéma 0000-0002 n'expose aucun moyen serveur de :
--   1. vérifier la disponibilité d'un username en temps réel (onboarding —
--      lecture cross-user de profiles, interdite par la RLS propriétaire) ;
--   2. choisir/modifier son username (profiles est en UPDATE propriétaire
--      avec citext unique — l'unicité case-insensitive doit être contrôlée
--      côté serveur pour renvoyer USERNAME_TAKEN proprement) ;
--   3. lire un profil PUBLIC (stats, vitrine, wishlist publique) — RLS
--      propriétaire sur profiles/user_cards/wishlists ;
--   4. gérer la vitrine (« 5 cartes favorites », SPEC §B /u/[username]) —
--      aucune colonne ne la stockait.
--
-- ADDITIF : une colonne profiles + 4 fonctions. Aucune table/RLS existante
-- modifiée. Conventions identiques à 0003 : SECURITY DEFINER + search_path
-- fixe, EXECUTE révoqué à PUBLIC puis accordé explicitement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Vitrine publique : ≤ 5 cartes possédées, ordre = ordre du tableau.
-- (uuid[] volontairement SANS FK : une carte brûlée disparaît de la vitrine
-- au prochain set_showcase ; la jointure any() ne renvoie que les cartes
-- encore présentes.)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists showcase_card_ids uuid[] not null default '{}';

comment on column public.profiles.showcase_card_ids is
  'Vitrine publique /u/[username] : ≤ 5 user_cards.id, ordre = position dans le tableau. Gérée par set_showcase (ownership vérifié), lue par get_public_profile.';

-- ----------------------------------------------------------------------------
-- check_username — disponibilité temps réel (onboarding). Public.
-- La regex est la duplication serveur documentée du pattern client
-- (^[A-Za-z0-9_-]{3,20}$) ; la comparaison citext rend le check insensible
-- à la casse à l'identique de la contrainte unique.
-- ----------------------------------------------------------------------------
create or replace function public.check_username(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_normalized text;
begin
  v_normalized := lower(btrim(coalesce(p_username, '')));
  if v_normalized !~ '^[a-z0-9_-]{3,20}$' then
    return jsonb_build_object('available', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.profiles where username = v_normalized) then
    return jsonb_build_object('available', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('available', true, 'reason', null);
end;
$fn$;

-- ----------------------------------------------------------------------------
-- set_username — choix / modification du pseudo. Auth requise.
-- 'INVALID_USERNAME' (format), 'USERNAME_TAKEN' (unique citext violée).
-- ----------------------------------------------------------------------------
create or replace function public.set_username(p_user uuid, p_username text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_normalized text;
begin
  perform public._require_profile(p_user);

  v_normalized := lower(btrim(coalesce(p_username, '')));
  if v_normalized !~ '^[a-z0-9_-]{3,20}$' then
    raise exception 'INVALID_USERNAME';
  end if;

  update public.profiles set username = v_normalized where id = p_user;
  return jsonb_build_object('username', v_normalized);
exception
  when unique_violation then
    raise exception 'USERNAME_TAKEN';
end;
$fn$;

-- ----------------------------------------------------------------------------
-- set_showcase — écrit la vitrine (≤ 5, ownership, ordre préservé).
-- 'VALIDATION_ERROR' (> 5 ou doublons après normalisation — déjà bloqué côté
-- Zod partagé, filet ultime), 'NOT_OWNER', 'CARD_NOT_FOUND'.
-- ----------------------------------------------------------------------------
create or replace function public.set_showcase(p_user uuid, p_card_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_unique  uuid[];
  v_count   int;
  v_card    record;
  v_showcase jsonb;
begin
  perform public._require_profile(p_user);

  -- Déduplication préservant l'ordre d'envoi.
  select coalesce(array_agg(x order by ord), '{}'::uuid[])
    into v_unique
    from (select distinct on (x) x, ord
            from unnest(coalesce(p_card_ids, '{}'::uuid[])) with ordinality as u(x, ord)) s;

  if array_length(v_unique, 1) > 5 then
    raise exception 'VALIDATION_ERROR';
  end if;

  -- Toutes les cartes doivent exister ET appartenir au joueur.
  select count(*) into v_count from public.user_cards where id = any(v_unique);
  if v_count <> coalesce(array_length(v_unique, 1), 0) then
    raise exception 'CARD_NOT_FOUND';
  end if;
  for v_card in select user_id from public.user_cards where id = any(v_unique)
  loop
    if v_card.user_id <> p_user then
      raise exception 'NOT_OWNER';
    end if;
  end loop;

  update public.profiles set showcase_card_ids = v_unique where id = p_user;

  -- Vitrine re-lue dans l'ordre demandé (CardDto complet, cf. _card_json).
  select coalesce(
           jsonb_agg(public._card_json(uc, c, f, h, d)
                     order by array_position(p.showcase_card_ids, uc.id)),
           '[]'::jsonb)
    into v_showcase
    from public.profiles as p
    join public.user_cards as uc on uc.id = any(p.showcase_card_ids)
    join public.characters as c  on c.id = uc.character_id
    left join public.cosmetics as f on f.id = uc.frame_id
    left join public.cosmetics as h on h.id = uc.holo_id
    left join public.cosmetics as d on d.id = uc.dye_id
   where p.id = p_user;

  return jsonb_build_object('showcase', v_showcase);
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_public_profile — profil public /u/[username] en UN appel.
-- Stats + vitrine (CardDto) + wishlist publique (CharacterSummaryDto).
-- 'PROFILE_NOT_FOUND' si le username est inconnu.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_profile  public.profiles%rowtype;
  v_total    int;
  v_distinct int;
  v_best     int;
  v_highest  text;
  v_showcase jsonb;
  v_wishlist jsonb;
begin
  select * into v_profile
    from public.profiles
   where username = lower(btrim(coalesce(p_username, '')));
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select count(*) into v_total from public.characters;

  select count(distinct character_id), min(print_number)
    into v_distinct, v_best
    from public.user_cards
   where user_id = v_profile.id;

  -- Rareté la plus haute détenue (tie-break : plus petit print).
  select uc.rarity into v_highest
    from public.user_cards as uc
   where uc.user_id = v_profile.id
   order by public._rarity_rank(uc.rarity) desc, uc.print_number asc
   limit 1;

  select coalesce(
           jsonb_agg(public._card_json(uc, c, f, h, d)
                     order by array_position(p.showcase_card_ids, uc.id)),
           '[]'::jsonb)
    into v_showcase
    from public.profiles as p
    join public.user_cards as uc on uc.id = any(p.showcase_card_ids)
    join public.characters as c  on c.id = uc.character_id
    left join public.cosmetics as f on f.id = uc.frame_id
    left join public.cosmetics as h on h.id = uc.holo_id
    left join public.cosmetics as d on d.id = uc.dye_id
   where p.id = v_profile.id;

  select coalesce(
           jsonb_agg(public._character_summary(c) order by w.added_at),
           '[]'::jsonb)
    into v_wishlist
    from public.wishlists as w
    join public.characters as c on c.id = w.character_id
   where w.user_id = v_profile.id;

  return jsonb_build_object(
    'username',              v_profile.username,
    'created_at',            to_jsonb(v_profile.created_at),
    'login_streak',          v_profile.login_streak,
    'cards_obtained_count',  v_profile.cards_obtained_count,
    'collection', jsonb_build_object(
      'owned_characters', coalesce(v_distinct, 0),
      'total_characters', v_total,
      'percent',          case when v_total > 0
                               then round(coalesce(v_distinct, 0) * 100.0 / v_total, 1)
                               else 0 end
    ),
    'best_print_number',     v_best,
    'highest_rarity',        v_highest,
    'showcase',              v_showcase,
    'wishlist',              v_wishlist
  );
end;
$fn$;

-- ============================================================================
-- Permissions : EXECUTE révoqué par défaut (PUBLIC), accordé explicitement.
-- Les lectures publiques (check dispo, profil public) sont accessibles à
-- anon + authenticated — ce sont des données publiques par design (page
-- /u/[username] publique, SPEC §3). Les écritures exigent une session.
-- ============================================================================
revoke all on function public.check_username(text)          from public, anon;
revoke all on function public.get_public_profile(text)      from public, anon;
revoke all on function public.set_username(uuid, text)      from public, anon;
revoke all on function public.set_showcase(uuid, uuid[])    from public, anon;

grant execute on function public.check_username(text)       to anon, authenticated, service_role;
grant execute on function public.get_public_profile(text)   to anon, authenticated, service_role;
grant execute on function public.set_username(uuid, text)   to authenticated, service_role;
grant execute on function public.set_showcase(uuid, uuid[]) to authenticated, service_role;
