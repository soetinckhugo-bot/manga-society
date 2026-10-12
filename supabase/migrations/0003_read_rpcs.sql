-- ============================================================================
-- MANGA SOCIETY — RPC de LECTURE (migration additive 0003, Agent A)
--
-- Voir MIGRATIONS.md (racine) : la migration 0001 n'exposait que des
-- mutations. Les endpoints GET (boosters/state, collection, album, détail
-- carte, quêtes, wishlist, pool-info) exigent des agrégats en une seule
-- requête (pas de N+1, pas de logique métier côté handler) : ils sont donc
-- implémentés ici, en lecture seule, au plus près des contrats de
-- types/api.ts.
--
-- Conventions identiques à 0001 :
--   * SECURITY DEFINER + SET search_path = public ;
--   * aucune écriture économique ici (à l'exception d'ensure_daily_quests,
--     appelée par get_booster_state / get_daily_quests : générer les 3 quêtes
--     du jour à la première lecture du jour est le comportement spécifié —
--     "première action du jour (n'importe quelle RPC)") ;
--   * jour de jeu = (now() at time zone 'Europe/Paris')::date ;
--   * valeurs d'équilibrage (pity 25/200, stock 10, recharge 6 min, doré 10,
--     wishlist 10) dupliquées ici comme littéraux documentés — la source de
--     vérité métier reste lib/config.ts, les RPC en sont la duplication
--     serveur autorisée (convention 0001).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Helpers privés (préfixe _, EXECUTE révoqué en fin de fichier)
-- ----------------------------------------------------------------------------

-- Prochain minuit Europe/Paris (reset quêtes + pack du jour), en timestamptz.
create or replace function public._next_paris_midnight()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((public._paris_today() + 1) at time zone 'Europe/Paris');
$$;

-- Rang de rareté (common=1 … mythic=6) pour les tris.
create or replace function public._rarity_rank(p_rarity text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_rarity
           when 'common'    then 1
           when 'uncommon'  then 2
           when 'rare'      then 3
           when 'epic'      then 4
           when 'legendary' then 5
           when 'mythic'    then 6
           else 0
         end;
$$;

-- Résumé public d'un personnage (CharacterSummaryDto, types/api.ts).
create or replace function public._character_summary(c public.characters)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',                 c.id,
    'anilist_id',         c.anilist_id,
    'name_romaji',        c.name_romaji,
    'name_native',        c.name_native,
    'image_url',          c.image_url,
    'image_url_fallback', c.image_url_fallback,
    'anime_title',        c.anime_title,
    'base_rarity',        c.base_rarity,
    'print_count',        c.print_count,
    'wishlist_count',     c.wishlist_count
  );
$$;

-- Cosmétique au format CosmeticDto (types/api.ts — sans le slug interne).
create or replace function public._cosmetic_json(c public.cosmetics)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',            c.id,
    'type',          c.type,
    'name_fr',       c.name_fr,
    'name_en',       c.name_en,
    'chakra_price',  c.chakra_price,
    'is_ultra_rare', c.is_ultra_rare,
    'css_config',    c.css_config
  );
$$;

-- Carte au format CardDto (types/api.ts) à partir d'une ligne user_cards
-- complète + sa ligne characters + les éventuelles lignes cosmetics des 3
-- slots (null autorisés).
create or replace function public._card_json(
  uc public.user_cards,
  c  public.characters,
  f  public.cosmetics,
  h  public.cosmetics,
  d  public.cosmetics
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',           uc.id,
    'character',    public._character_summary(c),
    'print_number', uc.print_number,
    'first_owner',  uc.first_owner,
    'frame',        case when f.id is null then null else public._cosmetic_json(f) end,
    'holo',         case when h.id is null then null else public._cosmetic_json(h) end,
    'dye',          case when d.id is null then null else public._cosmetic_json(d) end,
    'source',       uc.source,
    'obtained_at',  to_jsonb(uc.obtained_at)
  );
$$;

-- ----------------------------------------------------------------------------
-- get_booster_state — état complet du panneau boosters (polling 30 s).
-- Une seule fonction : aucun N+1, solide sous charge. Le widget quêtes du
-- jour est généré ici (ensure_daily_quests, no-op la plupart du temps).
-- ----------------------------------------------------------------------------
create or replace function public.get_booster_state(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_today date := public._paris_today();
  p       public.profiles%rowtype;
  v_theme jsonb;
  v_theme_count int;
  v_day_offset bigint;
  v_quests jsonb;
begin
  select * into p from public.profiles where id = p_user;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- Première action du jour : génère les 3 quêtes (no-op ensuite).
  perform public.ensure_daily_quests(p_user);

  select count(*) into v_theme_count from public.themes;
  if v_theme_count > 0 then
    v_day_offset := (v_today - date '1970-01-01');
    select to_jsonb(t) into v_theme
      from public.themes as t
     order by t.sort_order
     limit 1
     offset (v_day_offset % v_theme_count);
  end if;

  select coalesce((public.get_daily_quests(p_user) -> 'quests'), '[]'::jsonb)
    into v_quests;

  return jsonb_build_object(
    'booster_count', p.booster_count,
    'max_stock', 10,
    'next_recharge_at',
      case when p.booster_count >= 10 then null
           else to_jsonb(p.last_booster_recharge + interval '6 minutes') end,
    'recharge_interval_minutes', 6,
    'premium_points', p.premium_points,
    'chakra', p.chakra,
    'pity_legendary_left',  greatest(0, 25  - p.pity_legendary),
    'pity_mythic_left',     greatest(0, 200 - p.pity_mythic),
    'golden_counter', p.golden_counter,
    'golden_every', 10,
    'daily_pack', jsonb_build_object(
      'available',     (p.daily_pack_claimed is null or p.daily_pack_claimed < v_today),
      'theme',         v_theme,
      'next_reset_at',
        case when (p.daily_pack_claimed is null or p.daily_pack_claimed < v_today)
             then to_jsonb(public._next_paris_midnight()) else null end
    ),
    'quest_widget', v_quests,
    'login_streak', p.login_streak
  );
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_collection_page — page de collection paginée par curseur (pas
-- d'offset). Filtres (thème/rareté/recherche) et tris exécutés côté SQL ;
-- le curseur est un jsonb opaque { "id": uuid, "k": [clés de tri] } encodé
-- en base64url côté handler.
-- ----------------------------------------------------------------------------
create or replace function public.get_collection_page(
  p_user   uuid,
  p_cursor jsonb default null,
  p_limit  int   default 24,
  p_theme  text  default null,
  p_rarity text  default null,
  p_search text  default null,
  p_sort   text  default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_raw   jsonb;
  v_items jsonb;
  v_next  jsonb;
  v_len   int;
  v_last  jsonb;
begin
  with filtered as (
    select
        uc                                   as uc_row,
        c                                    as c_row,
        uc.id                                as cid,
        uc.obtained_at                       as oa,
        uc.print_number                      as pn,
        public._rarity_rank(c.base_rarity)   as rrank,
        lower(c.name_romaji)                 as lname
      from public.user_cards  as uc
      join public.characters  as c on c.id = uc.character_id
     where uc.user_id = p_user
       and (p_theme  is null or p_theme  = '' or c.themes @> array[p_theme]::text[])
       and (p_rarity is null or p_rarity = '' or c.base_rarity = p_rarity)
       and (p_search is null or p_search = ''
            or lower(c.name_romaji) like '%' || lower(p_search) || '%')
       and (p_cursor is null or
            case
              when p_sort = 'rarity' then
                (public._rarity_rank(c.base_rarity), uc.obtained_at, uc.id)
                  < ((p_cursor->'k'->>0)::int, (p_cursor->'k'->>1)::timestamptz, (p_cursor->>'id')::uuid)
              when p_sort = 'print_number' then
                (uc.print_number, uc.id)
                  > ((p_cursor->'k'->>0)::int, (p_cursor->>'id')::uuid)
              when p_sort = 'name' then
                (lower(c.name_romaji), uc.id)
                  > ((p_cursor->'k'->>0)::text, (p_cursor->>'id')::uuid)
              else
                (uc.obtained_at, uc.id)
                  < ((p_cursor->'k'->>0)::timestamptz, (p_cursor->>'id')::uuid)
            end)
     order by
       case when p_sort = 'rarity'       then public._rarity_rank(c.base_rarity) end desc,
       case when p_sort = 'print_number' then uc.print_number                    end asc,
       case when p_sort = 'name'         then lower(c.name_romaji)               end asc,
       case when coalesce(p_sort, 'recent') in ('recent', 'rarity')
            then uc.obtained_at end desc,
       case when p_sort = 'print_number' then uc.id end,
       case when p_sort = 'name'         then uc.id end,
       uc.id desc
     limit v_limit + 1
  ), shaped as (
    select jsonb_build_object(
             'card',  public._card_json(f.uc_row, f.c_row, co, ho, dy),
             'cid',   f.cid,
             'oa',    f.oa,
             'pn',    f.pn,
             'rrank', f.rrank,
             'lname', f.lname
           ) as row_obj
      from filtered f
      left join public.cosmetics co on co.id = f.uc_row.frame_id
      left join public.cosmetics ho on ho.id = f.uc_row.holo_id
      left join public.cosmetics dy on dy.id = f.uc_row.dye_id
  )
  select coalesce(jsonb_agg(s.row_obj order by
             case when p_sort = 'rarity'       then (s.row_obj->>'rrank')::int end desc,
             case when p_sort = 'print_number' then (s.row_obj->>'pn')::int    end asc,
             case when p_sort = 'name'         then s.row_obj->>'lname'        end asc,
             case when coalesce(p_sort, 'recent') in ('recent', 'rarity')
                  then (s.row_obj->>'oa')::timestamptz end desc,
             case when p_sort = 'print_number' then (s.row_obj->>'cid')::uuid end,
             case when p_sort = 'name'         then (s.row_obj->>'cid')::uuid end,
             (s.row_obj->>'cid')::uuid desc), '[]'::jsonb)
    into v_raw
    from shaped s;

  v_len := jsonb_array_length(v_raw);

  if v_len > v_limit then
    v_last := v_raw -> (v_len - 1);
    v_next := case
      when p_sort = 'rarity' then
        jsonb_build_object('id', v_last->>'cid', 'k', jsonb_build_array(v_last->'rrank', v_last->'oa'))
      when p_sort = 'print_number' then
        jsonb_build_object('id', v_last->>'cid', 'k', jsonb_build_array(v_last->'pn'))
      when p_sort = 'name' then
        jsonb_build_object('id', v_last->>'cid', 'k', jsonb_build_array(v_last->'lname'))
      else
        jsonb_build_object('id', v_last->>'cid', 'k', jsonb_build_array(v_last->'oa'))
    end;
  end if;

  select coalesce(jsonb_agg(e -> 'card'), '[]'::jsonb)
    into v_items
    from jsonb_path_query(
           v_raw,
           format('$[0 to %s]', greatest(v_limit - 1, 0))::jsonpath
         ) as e;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_album — silhouettes groupées par anime. Un seul parcours de
-- characters (left join user_cards du joueur), regroupé en PL/pgSQL.
-- ----------------------------------------------------------------------------
create or replace function public.get_album(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  r           record;
  v_title     text;
  g_title     text;
  v_entries   jsonb := '[]'::jsonb;
  v_groups    jsonb := '[]'::jsonb;
  g_total     int := 0;
  g_owned     int := 0;
  v_total_all int := 0;
  v_owned_all int := 0;
begin
  for r in
    select c as c_row,
           count(uc.id)         as owned_count,
           min(uc.print_number) as best_print
      from public.characters as c
      left join public.user_cards as uc
             on uc.character_id = c.id and uc.user_id = p_user
     group by c.id
     order by coalesce(c.anime_title, ''), c.name_romaji
  loop
    v_title := coalesce(r.c_row.anime_title, 'Autre');

    if v_title is distinct from g_title then
      if g_title is not null then
        v_groups := v_groups || jsonb_build_array(jsonb_build_object(
          'anime_title', g_title, 'total', g_total, 'owned', g_owned, 'entries', v_entries));
      end if;
      g_title   := v_title;
      g_total   := 0;
      g_owned   := 0;
      v_entries := '[]'::jsonb;
    end if;

    g_total := g_total + 1;
    v_total_all := v_total_all + 1;
    if r.owned_count > 0 then
      g_owned := g_owned + 1;
      v_owned_all := v_owned_all + 1;
    end if;

    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'character',         public._character_summary(r.c_row),
      'owned',             r.owned_count > 0,
      'owned_count',       r.owned_count,
      'best_print_number', r.best_print
    ));
  end loop;

  if g_title is not null then
    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'anime_title', g_title, 'total', g_total, 'owned', g_owned, 'entries', v_entries));
  end if;

  return jsonb_build_object(
    'groups', v_groups,
    'total_characters', v_total_all,
    'owned_characters', v_owned_all
  );
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_card_detail — détail d'une carte possédée + nb de joueurs possédant
-- ce perso (count distinct indexé). CARD_NOT_FOUND si non possédée.
-- ----------------------------------------------------------------------------
create or replace function public.get_card_detail(p_user uuid, p_card_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_result jsonb;
begin
  select public._card_json(uc, c, f, h, d)
         || jsonb_build_object(
              'owners_count',
              (select count(distinct uc2.user_id)
                 from public.user_cards as uc2
                where uc2.character_id = uc.character_id)
            )
    into v_result
    from public.user_cards  as uc
    join public.characters  as c on c.id = uc.character_id
    left join public.cosmetics as f on f.id = uc.frame_id
    left join public.cosmetics as h on h.id = uc.holo_id
    left join public.cosmetics as d on d.id = uc.dye_id
   where uc.id = p_card_id
     and uc.user_id = p_user;

  if v_result is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  return v_result;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_daily_quests — les 3 quêtes du jour (générées si première action) +
-- prochain minuit Europe/Paris.
-- ----------------------------------------------------------------------------
create or replace function public.get_daily_quests(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_today  date := public._paris_today();
  v_quests jsonb;
begin
  perform public.ensure_daily_quests(p_user);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',            uq.quest_id,
           'key',           q.key,
           'type',          q.type,
           'goal',          q.goal,
           'progress',      uq.progress,
           'completed',     uq.completed,
           'claimed',       uq.claimed,
           'chakra_reward', q.chakra_reward,
           'name_fr',       q.name_fr,
           'name_en',       q.name_en
         ) order by uq.quest_id), '[]'::jsonb)
    into v_quests
    from public.user_quests as uq
    join public.quests      as q on q.id = uq.quest_id
   where uq.user_id = p_user
     and uq.day = v_today;

  return jsonb_build_object(
    'quests',        v_quests,
    'next_reset_at', public._next_paris_midnight()
  );
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_wishlist — wishlist du joueur + compteur de slots.
-- ----------------------------------------------------------------------------
create or replace function public.get_wishlist(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_items jsonb;
  v_used  int;
begin
  select coalesce(jsonb_agg(public._character_summary(c) order by w.added_at), '[]'::jsonb),
         count(*)
    into v_items, v_used
    from public.wishlists  as w
    join public.characters as c on c.id = w.character_id
   where w.user_id = p_user;

  return jsonb_build_object(
    'items',      v_items,
    'slots_used', v_used,
    'slots_max',  10
  );
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_theme_pool_info — nb de persos par rareté d'un thème + nb d'envies du
-- joueur présentes ("X de tes envies dans ce booster"). THEME_NOT_FOUND si
-- slug inconnu.
-- ----------------------------------------------------------------------------
create or replace function public.get_theme_pool_info(p_user uuid, p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_by_rarity jsonb;
  v_total     int;
  v_matches   int;
begin
  if not exists (select 1 from public.themes where slug = p_slug) then
    raise exception 'THEME_NOT_FOUND';
  end if;

  select count(*) into v_total
    from public.characters
   where p_slug = any(themes);

  select coalesce(jsonb_object_agg(t.tier, coalesce(s.cnt, 0)), '{}'::jsonb)
    into v_by_rarity
    from (values ('common'), ('uncommon'), ('rare'), ('epic'), ('legendary'), ('mythic'))
           as t(tier)
    left join (
      select base_rarity, count(*) as cnt
        from public.characters
       where p_slug = any(themes)
       group by base_rarity
    ) as s on s.base_rarity = t.tier;

  select count(*) into v_matches
    from public.wishlists  as w
    join public.characters as c on c.id = w.character_id
   where w.user_id = p_user
     and p_slug = any(c.themes);

  return jsonb_build_object(
    'theme_slug',       p_slug,
    'total_characters', v_total,
    'by_rarity',        v_by_rarity,
    'wishlist_matches', v_matches
  );
end;
$fn$;

-- ----------------------------------------------------------------------------
-- get_next_reset_at — prochain minuit Europe/Paris (reset quotidien).
-- Utilisé par POST /api/boosters/daily pour renvoyer next_reset_at calculé
-- côté serveur (jamais l'horloge client).
-- ----------------------------------------------------------------------------
create or replace function public.get_next_reset_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public._next_paris_midnight();
$$;

-- ============================================================================
-- Permissions : EXECUTE révoqué par défaut (PUBLIC), ré-accordé aux
-- fonctions publiques de lecture pour authenticated ET service_role
-- (service_role = scripts de test/smoke). Les helpers '_' restent privés.
-- ============================================================================
revoke all on function public._next_paris_midnight() from public, anon, authenticated, service_role;
revoke all on function public._rarity_rank(text) from public, anon, authenticated, service_role;
revoke all on function public._character_summary(public.characters) from public, anon, authenticated, service_role;
revoke all on function public._cosmetic_json(public.cosmetics) from public, anon, authenticated, service_role;
revoke all on function public._card_json(public.user_cards, public.characters, public.cosmetics, public.cosmetics, public.cosmetics) from public, anon, authenticated, service_role;

revoke all on function public.get_booster_state(uuid) from public, anon;
revoke all on function public.get_collection_page(uuid, jsonb, int, text, text, text, text) from public, anon;
revoke all on function public.get_album(uuid) from public, anon;
revoke all on function public.get_card_detail(uuid, uuid) from public, anon;
revoke all on function public.get_daily_quests(uuid) from public, anon;
revoke all on function public.get_wishlist(uuid) from public, anon;
revoke all on function public.get_theme_pool_info(uuid, text) from public, anon;
revoke all on function public.get_next_reset_at() from public, anon;

grant execute on function public.get_booster_state(uuid) to authenticated, service_role;
grant execute on function public.get_collection_page(uuid, jsonb, int, text, text, text, text) to authenticated, service_role;
grant execute on function public.get_album(uuid) to authenticated, service_role;
grant execute on function public.get_card_detail(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_daily_quests(uuid) to authenticated, service_role;
grant execute on function public.get_wishlist(uuid) to authenticated, service_role;
grant execute on function public.get_theme_pool_info(uuid, text) to authenticated, service_role;
grant execute on function public.get_next_reset_at() to authenticated, service_role;
