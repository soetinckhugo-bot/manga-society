-- ============================================================================
-- MANGA SOCIETY — Correctif RPC open_premium_booster (migration additive
-- 0004, Agent A). Voir MIGRATIONS.md.
--
-- MOTIF (bug bloquant d'économie) : l'implémentation 0001 accordait 5 cartes
-- par booster premium (4 rolls à poids complets + slot garanti), alors que
-- la règle produit verrouillée est : 10 points premium = 1 carte avec
-- Légendaire minimum (roll interne 85 % L / 15 % M — lib/config.ts
-- premium.minRarity/weights ; PROMPT 0 §2 "1 carte Légendaire minimum").
-- L'écart gonflait l'obtention de cartes ×5 par rapport à l'équilibrage.
--
-- CORRECTION : create or replace de la fonction — signature inchangée
-- (les grants EXECUTE de 0001 restent valides), comportement corrigé :
--   * toujours 10 points débités ('NOT_ENOUGH_POINTS' sinon) ;
--   * UNE carte : priorité pity M > pity L > roll 85/15 (le M satisfait
--     aussi la garantie L) — la carte ne descend jamais sous Légendaire ;
--   * l'ouverture compte toujours dans le pity ET le doré (SPEC §1) ;
--   * idempotence par clé inchangée (résultat stocké rejoué tel quel —
--     les anciens résultats 5-cartes déjà stockés restent rejouables tels
--     quels, sans nouvel effet) ;
--   * p_weights devient inutilisé (aucun roll à poids complets) : conservé
--     dans la signature pour ne pas casser les grants ; ignoré.
-- ============================================================================

create or replace function public.open_premium_booster(
  p_user uuid,
  p_idempotency_key uuid,
  p_weights jsonb default null,
  p_guaranteed_legendary_chance numeric default 0.85
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_pg jsonb;
  v_theme_slug text;
  v_theme_count int;
  v_day_offset bigint;
  v_rarity text;
  v_char_id uuid;
  v_card jsonb;
  v_premium_points int;
  v_chakra int;
begin
  -- (0) Idempotence : double-clic / retry / refresh → résultat stocké.
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'open_premium_booster');
  if v_early is not null then
    return v_early;
  end if;

  perform public._require_profile(p_user);

  -- (1) Débit des 10 points AVANT tout effet (un échec ne consomme rien).
  update public.profiles
     set premium_points = premium_points - 10
   where id = p_user
     and premium_points >= 10
  returning premium_points into v_premium_points;
  if v_premium_points is null then
    raise exception 'NOT_ENOUGH_POINTS';
  end if;

  -- (2) Pity + doré (l'ouverture premium compte dans les deux — SPEC §1).
  v_pg := public._apply_pity_and_golden(p_user);

  -- (3) Thème du jour comme pool (rotation déterministe, cf. daily pack).
  select count(*) into v_theme_count from public.themes;
  if v_theme_count = 0 then
    raise exception 'EMPTY_POOL';
  end if;
  v_day_offset := (public._paris_today() - date '1970-01-01');
  select slug into v_theme_slug
    from public.themes
   order by sort_order
   limit 1
   offset (v_day_offset % v_theme_count);

  -- (4) LA carte premium : jamais sous Légendaire. Priorité : pity M >
  --     pity L > roll 85/15 (un M satisfait aussi la garantie L).
  if (v_pg->>'force_mythic')::boolean then
    v_rarity := 'mythic';
  elsif (v_pg->>'force_legendary')::boolean
     or random()::numeric < p_guaranteed_legendary_chance then
    v_rarity := 'legendary';
  else
    v_rarity := 'mythic';
  end if;

  -- (5) Attribution atomique du print (_grant_card : UPDATE ... RETURNING
  --     + contrainte unique = filet ultime).
  v_char_id := public._pick_character(v_theme_slug, v_rarity);
  v_card := public._grant_card(p_user, v_char_id, 'premium');

  -- (6) Quêtes + historique.
  perform public.update_quest_progress(p_user, 'open_boosters', 1);

  insert into public.booster_openings (user_id, theme_slug, is_golden, pity_legendary_after, pity_mythic_after)
  values (p_user, null, (v_pg->>'is_golden')::boolean,
          (v_pg->>'pity_legendary')::int, (v_pg->>'pity_mythic')::int);

  select premium_points, chakra into v_premium_points, v_chakra
    from public.profiles where id = p_user;

  -- (7) Résultat : 'cards' à 1 élément (forme stable côté handler).
  v_card := jsonb_build_object(
    'cards',          jsonb_build_array(v_card),
    'is_golden',      (v_pg->>'is_golden')::boolean,
    'theme_slug',     v_theme_slug,
    'premium_points', v_premium_points,
    'chakra',         v_chakra,
    'pity_legendary', (v_pg->>'pity_legendary')::int,
    'pity_mythic',    (v_pg->>'pity_mythic')::int,
    'golden_counter', (v_pg->>'golden_counter')::int
  );
  perform public._idempotency_store(p_idempotency_key, v_card);
  return v_card;
end;
$fn$;

-- Permissions : la signature est inchangée, les grants EXECUTE de 0001
-- (authenticated, service_role) restent valides — reaffirmés ici par
-- sécurité (create or replace conserve les grants, l'instruction est un
-- no-op idempotent).
grant execute on function public.open_premium_booster(uuid, uuid, jsonb, numeric) to authenticated, service_role;
