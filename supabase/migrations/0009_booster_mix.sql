-- 0009_booster_mix.sql — Booster MIX : thème virtuel "pool complet" (Agent 0)
--
-- Décision produit V1 (verrouillée par l'orchestrateur, E-06) : le thème
-- 'mix' ouvre le booster sur la TOTALITÉ du pool, SANS filtre thème — c'est
-- le seul moyen de tirer les persos untagged (themes = [], 1 647 en prod).
--
-- Additif, trois points, aucune valeur d'équilibrage (poids / pity / caps)
-- touchée :
--   1. upsert du thème 'mix' (name_fr "Tous les persos", name_en
--      "All characters", sort_order dernier). La validation INVALID_THEME
--      d'open_booster est INCHANGÉE : tout slug inconnu est toujours refusé,
--      'mix' devient un slug connu.
--   2. _pick_character : prédicat (slug = 'mix' OR slug = any(themes)).
--      Central volontairement : open_booster, open_premium_booster et
--      claim_daily_pack en héritent. Effet de bord assumé + souhaité : la
--      rotation journalière (offset = jours % nb thèmes sur sort_order)
--      inclut désormais 'mix' → le daily pack tombe sur le pool complet
--      1 jour sur 7.
--   3. get_theme_pool_info : même prédicat sur ses trois comptages
--      (total, par rareté, envies) — /api/themes/mix/pool-info reflète le
--      pool réel du booster.

-- 1. Thème 'mix' (idempotent ; sort_order = dernier).
insert into public.themes (slug, name_fr, name_en, sort_order)
select 'mix', 'Tous les persos', 'All characters', coalesce(max(sort_order), 0) + 1
  from public.themes
on conflict (slug) do nothing;

-- 2. _pick_character — 'mix' ⇒ aucun filtre thème (untagged inclus).
create or replace function public._pick_character(p_theme_slug text, p_rarity text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  select c.id into v_id
    from public.characters as c
   where c.base_rarity = p_rarity
     and (p_theme_slug = 'mix' or p_theme_slug = any(c.themes))
   order by random()
   limit 1;
  if v_id is null then
    raise exception 'EMPTY_POOL';
  end if;
  return v_id;
end;
$fn$;

-- 3. get_theme_pool_info — même prédicat sur les trois comptages.
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
  perform public._assert_self(p_user);

  if not exists (select 1 from public.themes where slug = p_slug) then
    raise exception 'THEME_NOT_FOUND';
  end if;

  select count(*) into v_total
    from public.characters
   where p_slug = 'mix' or p_slug = any(themes);

  select coalesce(jsonb_object_agg(t.tier, coalesce(s.cnt, 0)), '{}'::jsonb)
    into v_by_rarity
    from (values ('common'), ('uncommon'), ('rare'), ('epic'), ('legendary'), ('mythic'))
           as t(tier)
    left join (
      select base_rarity, count(*) as cnt
        from public.characters
       where p_slug = 'mix' or p_slug = any(themes)
       group by base_rarity
    ) as s on s.base_rarity = t.tier;

  select count(*) into v_matches
    from public.wishlists  as w
    join public.characters as c on c.id = w.character_id
   where w.user_id = p_user
     and (p_slug = 'mix' or p_slug = any(c.themes));

  return jsonb_build_object(
    'theme_slug',       p_slug,
    'total_characters', v_total,
    'by_rarity',        v_by_rarity,
    'wishlist_matches', v_matches
  );
end;
$fn$;

-- Grants reprécisés (idempotents ; create or replace les conserve déjà).
revoke all on function public.get_theme_pool_info(uuid, text) from public, anon;
grant execute on function public.get_theme_pool_info(uuid, text) to authenticated, service_role;
