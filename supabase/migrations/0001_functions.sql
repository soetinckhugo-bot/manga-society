-- ============================================================================
-- MANGA SOCIETY — Fonctions SQL critiques (migration 0001)
--
-- Conventions transverses :
--   * Toutes les fonctions publiques sont SECURITY DEFINER + SET search_path =
--     public (contournent la RLS en tant que owner, ne dépendent d'aucun
--     search_path injectable).
--   * Idempotence : la PREMIÈRE instruction de chaque mutation d'économie est
--     `INSERT INTO idempotency_keys ... ON CONFLICT (key) DO NOTHING`. Conflit
--     → early return du résultat stocké ; résultat NULL → appel en cours
--     (concurrence sur la MÊME clé) → 'IDEMPOTENCY_IN_PROGRESS'. Tout
--     RAISE EXCEPTION rollback la transaction entière, y compris la ligne
--     idempotency : une tentative en échec ne bloque pas une retry avec une
--     nouvelle clé.
--   * Atomicité du print : UPDATE characters SET print_count = print_count + 1
--     ... RETURNING print_count, garanti par la contrainte unique
--     (character_id, print_number) sur user_cards. Deux ouvertures
--     simultanées ne peuvent jamais émettre le même print.
--   * Codes d'erreur métier (le client traduit, jamais le serveur) :
--     'NO_BOOSTER' 'NOT_ENOUGH_POINTS' 'ALREADY_CLAIMED' 'NOT_OWNER'
--     'INSUFFICIENT_CHAKRA' 'WISHLIST_FULL' 'INVALID_THEME'
--     'QUEST_NOT_COMPLETED' 'IDEMPOTENCY_IN_PROGRESS' 'PROFILE_NOT_FOUND'
--     'CHARACTER_NOT_FOUND' 'EMPTY_POOL' 'INVALID_WEIGHTS'
--   * Aucune fonction ne fait de HTTP call. Aucune fonction ne logge de
--     donnée sensible (pas d'email, pas de clé — seulement des ids et compteurs).
--   * Jour de jeu = (now() at time zone 'Europe/Paris')::date — jamais l'horloge client.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Helpers privés (préfixe _, non exposés : EXECUTE révoqué)
-- ----------------------------------------------------------------------------

-- Jour de jeu courant (Europe/Paris).
create or replace function public._paris_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

-- Roll pondéré d'un tier de rareté.
-- Les poids viennent d'un jsonb {common, uncommon, rare, epic, legendary, mythic}
-- (toute clé absente = poids 0). Renormalisation implicite : on tire sur
-- random() * somme(poids). Configurable par argument DEFAULT au niveau des
-- fonctions publiques : les taux restent côté serveur, jamais exposés au client.
create or replace function public._roll_rarity(p_weights jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  w_common    numeric := coalesce(nullif(p_weights->>'common','')::numeric,    0);
  w_uncommon  numeric := coalesce(nullif(p_weights->>'uncommon','')::numeric,  0);
  w_rare      numeric := coalesce(nullif(p_weights->>'rare','')::numeric,      0);
  w_epic      numeric := coalesce(nullif(p_weights->>'epic','')::numeric,      0);
  w_legendary numeric := coalesce(nullif(p_weights->>'legendary','')::numeric, 0);
  w_mythic    numeric := coalesce(nullif(p_weights->>'mythic','')::numeric,    0);
  v_total     numeric;
  v_r         numeric;
begin
  v_total := w_common + w_uncommon + w_rare + w_epic + w_legendary + w_mythic;
  if v_total <= 0 then
    raise exception 'INVALID_WEIGHTS';
  end if;
  v_r := random()::numeric * v_total;
  if v_r < w_common then return 'common'; end if;    v_r := v_r - w_common;
  if v_r < w_uncommon then return 'uncommon'; end if; v_r := v_r - w_uncommon;
  if v_r < w_rare then return 'rare'; end if;        v_r := v_r - w_rare;
  if v_r < w_epic then return 'epic'; end if;        v_r := v_r - w_epic;
  if v_r < w_legendary then return 'legendary'; end if;
  return 'mythic';
end;
$fn$;

-- Sélection uniforme d'un personnage d'un tier DANS un thème
-- (perso uniforme dans le tier et le thème — spéc tirage).
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
     and p_theme_slug = any(c.themes)
   order by random()
   limit 1;
  if v_id is null then
    raise exception 'EMPTY_POOL';
  end if;
  return v_id;
end;
$fn$;

-- Incrément pity + doré, commun à open_booster / open_premium_booster /
-- claim_daily_pack. À appeler APRÈS la vérification du droit d'ouvrir
-- (sinon un échec 'NO_BOOSTER' consommerait le pity).
-- Garanties : pity_legendary atteint 25 → reset 0 + force_legendary ;
-- pity_mythic atteint 200 → reset 0 + force_mythic (priorité au M).
-- Doré : golden_counter à 9 → ouverture dorée (taux ×2) et reset à 0,
-- sinon ++. Précondition d'atomicité : verrou implicite par UPDATE de la
-- ligne profiles (deux ouvertures simultanées d'un même user sont
-- sérialisées par le verrou de ligne).
create or replace function public._apply_pity_and_golden(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_pity_l int;
  v_pity_m int;
  v_golden_count int;
  v_force_l boolean := false;
  v_force_m boolean := false;
  v_is_golden boolean := false;
begin
  update public.profiles
     set pity_legendary = pity_legendary + 1,
         pity_mythic    = pity_mythic + 1,
         golden_counter = case when golden_counter >= 9 then 0 else golden_counter + 1 end
   where id = p_user
   returning pity_legendary, pity_mythic, golden_counter
     into v_pity_l, v_pity_m, v_golden_count;
  if v_pity_l is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- golden_counter vaut 0 après update uniquement si un reset a eu lieu.
  v_is_golden := (v_golden_count = 0);

  if v_pity_m >= 200 then
    update public.profiles set pity_mythic = 0 where id = p_user;
    v_pity_m := 0;
    v_force_m := true;
  end if;
  if v_pity_l >= 25 then
    update public.profiles set pity_legendary = 0 where id = p_user;
    v_pity_l := 0;
    v_force_l := true;
  end if;

  return jsonb_build_object(
    'force_legendary', v_force_l,
    'force_mythic',    v_force_m,
    'is_golden',       v_is_golden,
    'pity_legendary',  v_pity_l,
    'pity_mythic',     v_pity_m,
    'golden_counter',  v_golden_count
  );
end;
$fn$;

-- Attribution d'une carte : l'ATOMICITÉ DU PRINT vit ici.
-- Précondition d'atomicité : `UPDATE characters SET print_count =
-- print_count + 1 ... RETURNING print_count` — le verrou de ligne sur
-- characters sérialise deux tirages du même perso, et la contrainte unique
-- (character_id, print_number) est le filet ultime.
-- Crée aussi la ligne drops_log (audit Agent E) et incrémente
-- cards_obtained_count / premium_points (+1 par tranche de 100 cartes).
create or replace function public._grant_card(p_user uuid, p_character_id uuid, p_source text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_print int;
  v_card_id uuid;
  v_char record;
begin
  select id, name_romaji, anime_title, base_rarity into v_char
    from public.characters
   where id = p_character_id;
  if not found then
    raise exception 'CHARACTER_NOT_FOUND';
  end if;

  update public.characters
     set print_count = print_count + 1
   where id = p_character_id
   returning print_count into v_print;

  insert into public.user_cards (user_id, character_id, print_number, first_owner, source)
  values (p_user, p_character_id, v_print, true, p_source)
  returning id into v_card_id;

  insert into public.drops_log (user_id, character_id, rarity, print_number, source)
  values (p_user, p_character_id, v_char.base_rarity, v_print, p_source);

  update public.profiles
     set cards_obtained_count = cards_obtained_count + 1,
         premium_points = premium_points
                        + ((cards_obtained_count + 1) / 100)  -- nouvelle tranche de 100
                        - (cards_obtained_count / 100)        -- tranches déjà créditées
   where id = p_user;

  return jsonb_build_object(
    'card_id',      v_card_id,
    'character_id', p_character_id,
    'name_romaji',  v_char.name_romaji,
    'anime_title',  v_char.anime_title,
    'rarity',       v_char.base_rarity,
    'print_number', v_print,
    'first_owner',  true
  );
end;
$fn$;

-- Application des garanties pity sur les 5 tiers roulés : force un M si
-- force_mythic, sinon force un L (ou mieux) si force_legendary. La garantie
-- remplace le slot 1 si le tier exigé n'est pas déjà présent.
create or replace function public._apply_guarantees(p_tiers text[], p_pg jsonb)
returns text[]
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_tiers text[] := p_tiers;
begin
  if coalesce((p_pg->>'force_mythic')::boolean, false) then
    if not ('mythic' = any(v_tiers)) then
      v_tiers[1] := 'mythic';
    end if;
  elsif coalesce((p_pg->>'force_legendary')::boolean, false) then
    if not ('legendary' = any(v_tiers) or 'mythic' = any(v_tiers)) then
      v_tiers[1] := 'legendary';
    end if;
  end if;
  return v_tiers;
end;
$fn$;

-- Idempotence : insère la clé ; si conflit, retourne le résultat stocké
-- (early return) ou lève 'IDEMPOTENCY_IN_PROGRESS' si l'appel est en cours.
-- Retourne NULL quand la clé est nouvelle (le caller continue puis stocke
-- son résultat via _store_result).
create or replace function public._idempotency_begin(p_key uuid, p_user uuid, p_endpoint text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_rc int;
  v_result jsonb;
begin
  insert into public.idempotency_keys (key, user_id, endpoint, result)
  values (p_key, p_user, p_endpoint, null)
  on conflict (key) do nothing;
  get diagnostics v_rc = row_count;
  if v_rc = 0 then
    select result into v_result
      from public.idempotency_keys
     where key = p_key;
    if v_result is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;
    return v_result;
  end if;
  return null;
end;
$fn$;

create or replace function public._idempotency_store(p_key uuid, p_result jsonb)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.idempotency_keys
     set result = p_result
   where key = p_key;
$$;

-- Vérifie que le profil existe (pointe l'erreur avant toute écriture).
create or replace function public._require_profile(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$fn$;

-- ============================================================================
-- 1. open_booster — ouverture d'un booster gratuit à thème (5 cartes)
--
-- Intention : 1 booster = 5 cartes, roll pondéré par carte (défaut C55 / U25 /
-- R12 / E5 / L2.4 / M0.6, passé en p_weights jsonb avec DEFAULT pour rester
-- côté serveur), perso uniforme par tier DANS le thème. Pity visible (L ≤ 25,
-- M ≤ 200) et booster doré (tous les 10, taux L/M ×2) comptés ICI et dans
-- open_premium_booster / claim_daily_pack.
--
-- Préconditions d'atomicité :
--   * recharge (+1 / 6 min, cap 10) : vivent UNIQUEMENT ici, dans la même
--     transaction — jamais de calcul de recharge côté client ;
--   * débit booster : `UPDATE ... SET booster_count = booster_count - 1
--     WHERE id = p_user AND booster_count > 0 RETURNING` → jamais négatif
--     même en double-clic ;
--   * pity/doré : verrou de ligne profiles (sérialise les ouvertures d'un user) ;
--   * prints : UPDATE characters ... +1 ... RETURNING (voir _grant_card) ;
--   * idempotence : _idempotency_begin en PREMIER — tout RAISE rollback tout.
-- ============================================================================
create or replace function public.open_booster(
  p_user uuid,
  p_theme_slug text,
  p_idempotency_key uuid,
  p_weights jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_weights jsonb;
  v_pg jsonb;
  v_tiers text[] := array[]::text[];
  v_tier text;
  v_char_id uuid;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_epic_plus int;
  v_booster_count int;
  v_premium_points int;
  v_chakra int;
  v_cards_obtained int;
begin
  -- (0) Idempotence : double-clic, retry réseau, refresh pendant la requête
  --     → même clé = même résultat, 1 seul débit.
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'open_booster');
  if v_early is not null then
    return v_early;
  end if;

  perform public._require_profile(p_user);

  -- (a) Recharge due UNIQUEMENT ici (cap 10, +1 toutes les 6 minutes).
  update public.profiles as pr
     set booster_count = least(10, pr.booster_count + p.due),
         last_booster_recharge = case
           when pr.booster_count + p.due >= 10 then now()
           when p.due = 0 then pr.last_booster_recharge
           else pr.last_booster_recharge + (p.due * interval '6 minutes')
         end
    from (
      select floor(extract(epoch from (now() - last_booster_recharge)) / 360.0)::int as due
        from public.profiles
       where id = p_user
    ) as p
   where pr.id = p_user;

  -- (b) Thème valide.
  if not exists (select 1 from public.themes where slug = p_theme_slug) then
    raise exception 'INVALID_THEME';
  end if;

  -- (c) Débit du booster AVANT pity/golden : un 'NO_BOOSTER' ne doit pas
  --     consommer de pity ni faire avancer le compteur doré.
  update public.profiles
     set booster_count = booster_count - 1
   where id = p_user
     and booster_count > 0
  returning booster_count into v_booster_count;
  if v_booster_count is null then
    raise exception 'NO_BOOSTER';
  end if;

  -- (d) Pity + doré.
  v_pg := public._apply_pity_and_golden(p_user);

  -- (e) Poids : défaut serveur C55/U25/R12/E5/L2.4/M0.6 ; en doré les poids
  --     L et M sont doublés puis renormalisés (la renormalisation est
  --     implicite dans _roll_rarity : tirage sur random() * somme).
  v_weights := coalesce(p_weights, '{"common":55,"uncommon":25,"rare":12,"epic":5,"legendary":2.4,"mythic":0.6}'::jsonb);
  if (v_pg->>'is_golden')::boolean then
    v_weights := jsonb_build_object(
      'common',    coalesce(nullif(v_weights->>'common','')::numeric, 0),
      'uncommon',  coalesce(nullif(v_weights->>'uncommon','')::numeric, 0),
      'rare',      coalesce(nullif(v_weights->>'rare','')::numeric, 0),
      'epic',      coalesce(nullif(v_weights->>'epic','')::numeric, 0),
      'legendary', coalesce(nullif(v_weights->>'legendary','')::numeric, 0) * 2,
      'mythic',    coalesce(nullif(v_weights->>'mythic','')::numeric, 0) * 2
    );
  end if;

  -- (f) Roll de 5 raretés pondérées (indépendantes).
  for v_i in 1..5 loop
    v_tiers[v_i] := public._roll_rarity(v_weights);
  end loop;
  v_tiers := public._apply_guarantees(v_tiers, v_pg);

  -- (g) Tirage perso uniforme par tier dans le thème + atomicité du print.
  foreach v_tier in array v_tiers loop
    v_char_id := public._pick_character(p_theme_slug, v_tier);
    v_card := public._grant_card(p_user, v_char_id, 'booster');
    v_cards := v_cards || jsonb_build_array(v_card);
  end loop;

  -- (h) Progression des quêtes quotidiennes (génère les 3 quêtes du jour si
  --     première action du jour).
  perform public.update_quest_progress(p_user, 'open_boosters', 1);
  select count(*) into v_epic_plus
    from jsonb_array_elements(v_cards) as e
   where e->>'rarity' in ('epic', 'legendary', 'mythic');
  if v_epic_plus > 0 then
    perform public.update_quest_progress(p_user, 'obtain_epic_plus', v_epic_plus);
  end if;

  -- (i) Historique d'ouverture.
  insert into public.booster_openings (user_id, theme_slug, is_golden, pity_legendary_after, pity_mythic_after)
  values (
    p_user,
    p_theme_slug,
    (v_pg->>'is_golden')::boolean,
    (v_pg->>'pity_legendary')::int,
    (v_pg->>'pity_mythic')::int
  );

  -- (j) Résultat stocké pour l'idempotence et retourné au client.
  select booster_count, premium_points, chakra, cards_obtained_count
    into v_booster_count, v_premium_points, v_chakra, v_cards_obtained
    from public.profiles
   where id = p_user;

  v_card := jsonb_build_object(
    'cards',                v_cards,
    'is_golden',            (v_pg->>'is_golden')::boolean,
    'theme_slug',           p_theme_slug,
    'booster_count',        v_booster_count,
    'pity_legendary',       (v_pg->>'pity_legendary')::int,
    'pity_mythic',          (v_pg->>'pity_mythic')::int,
    'golden_counter',       (v_pg->>'golden_counter')::int,
    'premium_points',       v_premium_points,
    'chakra',               v_chakra,
    'cards_obtained_count', v_cards_obtained
  );
  perform public._idempotency_store(p_idempotency_key, v_card);
  return v_card;
end;
$fn$;

-- ============================================================================
-- 2. open_premium_booster — 10 premium_points, 5 cartes dont 1 Légendaire min
--
-- Intention : dépense de 10 premium_points, 5 cartes rollées. MÉTHODE DE LA
-- GARANTIE (documentée) : les 4 premières cartes utilisent les poids complets
-- (doré ×2 applicable) ; la 5e est le slot garanti — roll 85 % L / 15 % M
-- (p_guaranteed_legendary_chance, configurable) — SAUF si le pity s'est
-- déclenché sur cette ouverture : slot garanti = M si force_mythic, L si
-- force_legendary (le M satisfait aussi la garantie L). Le slot garanti ne
-- peut PAS redescendre sous L. Compte dans le pity ET le doré.
--
-- Préconditions d'atomicité : débit points `WHERE premium_points >= 10
-- RETURNING` (jamais négatif) ; verrou de ligne profiles ; prints via
-- _grant_card ; idempotence en premier.
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
  v_weights jsonb;
  v_pg jsonb;
  v_theme_slug text;
  v_theme_count int;
  v_day_offset bigint;
  v_tiers text[] := array[]::text[];
  v_tier text;
  v_char_id uuid;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_premium_points int;
  v_chakra int;
begin
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'open_premium_booster');
  if v_early is not null then
    return v_early;
  end if;

  perform public._require_profile(p_user);

  -- Débit des points AVANT pity/golden (un échec ne consomme pas le pity).
  update public.profiles
     set premium_points = premium_points - 10
   where id = p_user
     and premium_points >= 10
  returning premium_points into v_premium_points;
  if v_premium_points is null then
    raise exception 'NOT_ENOUGH_POINTS';
  end if;

  -- Thème du jour comme pool (déterministe, cf. claim_daily_pack).
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

  v_pg := public._apply_pity_and_golden(p_user);

  v_weights := coalesce(p_weights, '{"common":55,"uncommon":25,"rare":12,"epic":5,"legendary":2.4,"mythic":0.6}'::jsonb);
  if (v_pg->>'is_golden')::boolean then
    v_weights := jsonb_build_object(
      'common',    coalesce(nullif(v_weights->>'common','')::numeric, 0),
      'uncommon',  coalesce(nullif(v_weights->>'uncommon','')::numeric, 0),
      'rare',      coalesce(nullif(v_weights->>'rare','')::numeric, 0),
      'epic',      coalesce(nullif(v_weights->>'epic','')::numeric, 0),
      'legendary', coalesce(nullif(v_weights->>'legendary','')::numeric, 0) * 2,
      'mythic',    coalesce(nullif(v_weights->>'mythic','')::numeric, 0) * 2
    );
  end if;

  -- 4 rolls pondérés complets...
  for v_i in 1..4 loop
    v_tiers[v_i] := public._roll_rarity(v_weights);
  end loop;

  -- ...puis le slot garanti : priorité pity M > pity L > roll 85/15.
  if (v_pg->>'force_mythic')::boolean then
    v_tiers[5] := 'mythic';
  elsif (v_pg->>'force_legendary')::boolean
     or random()::numeric < p_guaranteed_legendary_chance then
    v_tiers[5] := 'legendary';
  else
    v_tiers[5] := 'mythic';
  end if;

  foreach v_tier in array v_tiers loop
    v_char_id := public._pick_character(v_theme_slug, v_tier);
    v_card := public._grant_card(p_user, v_char_id, 'premium');
    v_cards := v_cards || jsonb_build_array(v_card);
  end loop;

  -- Un booster premium compte pour la quête « ouvrir N boosters ».
  perform public.update_quest_progress(p_user, 'open_boosters', 1);

  insert into public.booster_openings (user_id, theme_slug, is_golden, pity_legendary_after, pity_mythic_after)
  values (p_user, null, (v_pg->>'is_golden')::boolean,
          (v_pg->>'pity_legendary')::int, (v_pg->>'pity_mythic')::int);

  select premium_points, chakra into v_premium_points, v_chakra
    from public.profiles where id = p_user;

  v_card := jsonb_build_object(
    'cards',          v_cards,
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

-- ============================================================================
-- 3. claim_daily_pack — pack du jour gratuit, 1/jour, thème rotatif, Épique min
--
-- Intention : 1 pack/jour (jour Europe/Paris), gratuit (ni booster ni point).
-- Thème du jour = rotation DÉTERMINISTE par sort_order : offset = (nb de
-- jours depuis epoch Paris) % nb de thèmes. 5 cartes rollées UNIQUEMENT dans
-- les tiers E+ (poids E5 / L2.4 / M0.6, renormalisés par _roll_rarity). Compte
-- dans le pity ET le doré.
--
-- Préconditions d'atomicité : unicité par jour via daily_pack_claimed = jour
-- courant (verrou de ligne) ; idempotence par clé ; prints via _grant_card.
-- ============================================================================
create or replace function public.claim_daily_pack(
  p_user uuid,
  p_idempotency_key uuid,
  p_weights jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_today date := public._paris_today();
  v_ok boolean;
  v_theme_slug text;
  v_day_offset bigint;
  v_theme_count int;
  v_weights jsonb;
  v_pg jsonb;
  v_tiers text[] := array[]::text[];
  v_tier text;
  v_char_id uuid;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
begin
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'claim_daily_pack');
  if v_early is not null then
    return v_early;
  end if;

  perform public._require_profile(p_user);

  -- 1/jour strict : tout raise rollback, donc un échec ne marque pas le jour.
  update public.profiles
     set daily_pack_claimed = v_today
   where id = p_user
     and (daily_pack_claimed is null or daily_pack_claimed < v_today)
  returning true into v_ok;
  if v_ok is null then
    raise exception 'ALREADY_CLAIMED';
  end if;

  -- Thème du jour : rotation déterministe par sort_order.
  select count(*) into v_theme_count from public.themes;
  if v_theme_count = 0 then
    raise exception 'EMPTY_POOL';
  end if;
  v_day_offset := (v_today - date '1970-01-01');
  select slug into v_theme_slug
    from public.themes
   order by sort_order
   limit 1
   offset (v_day_offset % v_theme_count);
  if v_theme_slug is null then
    raise exception 'EMPTY_POOL';
  end if;

  v_pg := public._apply_pity_and_golden(p_user);

  -- Roll UNIQUEMENT dans les tiers E+ (toute clé < E ignorée = poids 0).
  v_weights := coalesce(p_weights, '{"epic":5,"legendary":2.4,"mythic":0.6}'::jsonb);
  for v_i in 1..5 loop
    v_tiers[v_i] := public._roll_rarity(v_weights);
  end loop;
  v_tiers := public._apply_guarantees(v_tiers, v_pg);

  foreach v_tier in array v_tiers loop
    v_char_id := public._pick_character(v_theme_slug, v_tier);
    v_card := public._grant_card(p_user, v_char_id, 'daily');
    v_cards := v_cards || jsonb_build_array(v_card);
  end loop;

  perform public.update_quest_progress(p_user, 'claim_daily_pack', 1);

  insert into public.booster_openings (user_id, theme_slug, is_golden, pity_legendary_after, pity_mythic_after)
  values (p_user, v_theme_slug, (v_pg->>'is_golden')::boolean,
          (v_pg->>'pity_legendary')::int, (v_pg->>'pity_mythic')::int);

  v_card := jsonb_build_object(
    'cards',          v_cards,
    'is_golden',      (v_pg->>'is_golden')::boolean,
    'theme_slug',     v_theme_slug,
    'day',            v_today,
    'pity_legendary', (v_pg->>'pity_legendary')::int,
    'pity_mythic',    (v_pg->>'pity_mythic')::int,
    'golden_counter', (v_pg->>'golden_counter')::int
  );
  perform public._idempotency_store(p_idempotency_key, v_card);
  return v_card;
end;
$fn$;

-- ============================================================================
-- 4. burn_card — brûler une carte doublon contre du chakra
--
-- Intention : ownership check ('NOT_OWNER'), suppression, crédit chakra =
-- table de burn[rareté] × (1 + min(wishlist_count / 1000, 2)) — mécanique
-- Karuta : brûler un perso convoité rapporte plus. Table de burn passée en
-- jsonb avec DEFAULT (C5 / U8 / R15 / E30 / L80 / M200) pour rester
-- côté serveur, duplicable en config.
--
-- Préconditions d'atomicité : suppression conditionnée au ownership
-- (`DELETE ... WHERE id = p_card_id AND user_id = p_user RETURNING` — 0 ligne
-- = 'NOT_OWNER') ; crédit dans la même transaction ; idempotence par clé.
-- ============================================================================
create or replace function public.burn_card(
  p_user uuid,
  p_card_id uuid,
  p_idempotency_key uuid,
  p_burn_table jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_burn_table jsonb;
  v_rarity text;
  v_wishlist_count int;
  v_base numeric;
  v_gained int;
  v_new_balance int;
begin
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'burn_card');
  if v_early is not null then
    return v_early;
  end if;

  v_burn_table := coalesce(p_burn_table, '{"common":5,"uncommon":8,"rare":15,"epic":30,"legendary":80,"mythic":200}'::jsonb);

  -- Ownership + infos de valorisation (join characters pour wishlist_count).
  select c.base_rarity, ch.wishlist_count into v_rarity, v_wishlist_count
    from public.user_cards as c
    join public.characters as ch on ch.id = c.character_id
   where c.id = p_card_id
     and c.user_id = p_user;
  if not found then
    raise exception 'NOT_OWNER';
  end if;

  -- Suppression : conditionnée au ownership, jamais orpheline.
  delete from public.user_cards
   where id = p_card_id
     and user_id = p_user;
  if not found then
    raise exception 'NOT_OWNER';
  end if;

  v_base := coalesce(nullif(v_burn_table->>v_rarity, '')::numeric, 0);
  v_gained := round(v_base * (1 + least(v_wishlist_count / 1000.0, 2)))::int;

  update public.profiles
     set chakra = chakra + v_gained
   where id = p_user
  returning chakra into v_new_balance;

  perform public.update_quest_progress(p_user, 'burn_cards', 1);

  v_early := jsonb_build_object(
    'card_id',      p_card_id,
    'rarity',       v_rarity,
    'chakra_gained', v_gained,
    'new_balance',  v_new_balance
  );
  perform public._idempotency_store(p_idempotency_key, v_early);
  return v_early;
end;
$fn$;

-- ============================================================================
-- 5. Quêtes quotidiennes
--    update_quest_progress / ensure_daily_quests / claim_quests
--
-- Intention : 3 quêtes aléatoires parmi le pool actif, générées à la première
-- action du jour (jour Europe/Paris), auto-complete à goal, crédit de
-- chakra_reward au claim. Idempotence par jour : la pk
-- (user_id, quest_id, day) rend tout rejou du même jour sans effet.
-- ============================================================================

-- Génère les 3 quêtes du jour si absentes. Randomness UNIQUEMENT côté serveur
-- (ORDER BY random()). Le verrou de ligne sur profiles sérialise deux
-- premières actions concurrentes du même user (sinon 4-6 quêtes possibles).
create or replace function public.ensure_daily_quests(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := public._paris_today();
  v_count int;
begin
  select count(*) into v_count
    from public.user_quests
   where user_id = p_user
     and day = v_today;
  if v_count > 0 then
    return;
  end if;

  -- Verrou par user : sérialise la génération (même mécanisme que les ouvertures).
  perform 1 from public.profiles where id = p_user for update;

  -- Double check post-verrou (un appel concurrent a pu générer entre-temps).
  select count(*) into v_count
    from public.user_quests
   where user_id = p_user
     and day = v_today;
  if v_count > 0 then
    return;
  end if;

  insert into public.user_quests (user_id, quest_id, progress, completed, claimed, day)
  select p_user, q.id, 0, false, false, v_today
    from public.quests as q
   where q.active = true
   order by random()
   limit 3;
end;
$fn$;

-- Progresse les quêtes actives du jour d'un type donné, auto-complete à goal
-- (planché par least(progress + amount, goal) : pas de dépassement).
create or replace function public.update_quest_progress(p_user uuid, p_type text, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := public._paris_today();
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;
  perform public.ensure_daily_quests(p_user);
  update public.user_quests as uq
     set progress  = least(uq.progress + p_amount, q.goal),
         completed = least(uq.progress + p_amount, q.goal) >= q.goal
    from public.quests as q
   where uq.quest_id = q.id
     and uq.user_id = p_user
     and uq.day = v_today
     and uq.claimed = false
     and q.type = p_type
     and q.active = true;
end;
$fn$;

-- Claim : crédite chakra_reward pour chaque quête demandée complétée et non
-- claimée. Idempotent par jour : re-claim le même jour = no-op (claimed déjà
-- true, l'UPDATE ne touche rien). Une quête incomplète parmi les demandées =
-- 'QUEST_NOT_COMPLETED' (rien n'est crédité : la vérification précède l'UPDATE).
create or replace function public.claim_quests(p_user uuid, p_quest_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := public._paris_today();
  v_total int;
  v_balance int;
  v_claimed jsonb;
begin
  if p_quest_ids is null or array_length(p_quest_ids, 1) is null then
    raise exception 'EMPTY_CLAIM';
  end if;

  perform public.ensure_daily_quests(p_user);
  perform 1 from public.profiles where id = p_user for update;

  if exists (
    select 1
      from public.user_quests as uq
     where uq.user_id = p_user
       and uq.day = v_today
       and uq.quest_id = any(p_quest_ids)
       and uq.completed = false
  ) then
    raise exception 'QUEST_NOT_COMPLETED';
  end if;

  with c as (
    update public.user_quests as uq
       set claimed = true
     where uq.user_id = p_user
       and uq.day = v_today
       and uq.quest_id = any(p_quest_ids)
       and uq.completed = true
       and uq.claimed = false
     returning uq.quest_id
  )
  select coalesce(sum(q.chakra_reward), 0), coalesce(jsonb_agg(c.quest_id), '[]'::jsonb)
    into v_total, v_claimed
    from c
    join public.quests as q on q.id = c.quest_id;

  if v_total > 0 then
    update public.profiles
       set chakra = chakra + v_total
     where id = p_user
    returning chakra into v_balance;
  else
    select chakra into v_balance from public.profiles where id = p_user;
  end if;

  return jsonb_build_object(
    'claimed',       v_claimed,
    'chakra_gained', v_total,
    'new_balance',   v_balance
  );
end;
$fn$;

-- ============================================================================
-- 6. update_login_streak — série de connexion (appelé à chaque login)
--
-- Intention : hier → ++, aujourd'hui → no-op, sinon reset à 1. Récompense :
-- tous les 7 jours de streak (7, 14, 21…) → cosmétique 'streak-7' (convention
-- findable par slug, créé dans seed.sql) ; sinon chakra croissant.
-- TABLE DE RÉCOMPENSE CHAKRA (documentée, duplicable en config) :
--   jours 1→6  : chakra = streak × 5  (5, 10, 15, 20, 25, 30)
--   jours 8+   : chakra = min(streak, 10) × 5 (40, 45, 50 puis plafond 50)
--   jours ×7   : cosmétique streak-7 (is_ultra_rare, non achetable)
--
-- Préconditions d'atomicité : verrou de ligne profiles (deux logins
-- simultanés du même user = un seul increment) ; test jour précédent sur
-- last_login_date (Europe/Paris) ; jamais de double récompense le même jour.
-- ============================================================================
create or replace function public.update_login_streak(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := public._paris_today();
  v_last date;
  v_streak int;
  v_balance int;
  v_chakra int := 0;
  v_cosmetic_id uuid;
begin
  select last_login_date, login_streak into v_last, v_streak
    from public.profiles
   where id = p_user
   for update;
  if v_streak is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- Déjà logué aujourd'hui : no-op strict (double claim impossible).
  if v_last = v_today then
    select chakra into v_balance from public.profiles where id = p_user;
    return jsonb_build_object(
      'login_streak',  v_streak,
      'reward',        'none',
      'chakra_gained', 0,
      'new_balance',   v_balance
    );
  end if;

  if v_last = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.profiles
     set login_streak = v_streak,
         last_login_date = v_today
   where id = p_user;

  if v_streak % 7 = 0 then
    -- Récompense cosmétique du palier ×7 : convention findable par slug.
    select id into v_cosmetic_id
      from public.cosmetics
     where slug = 'streak-7';
    if v_cosmetic_id is not null then
      insert into public.user_cosmetics (user_id, cosmetic_id)
      values (p_user, v_cosmetic_id)
      on conflict (user_id, cosmetic_id) do nothing;
    end if;
    return jsonb_build_object(
      'login_streak',  v_streak,
      'reward',        'cosmetic',
      'cosmetic_slug', 'streak-7',
      'chakra_gained', 0
    );
  end if;

  -- Chakra croissant (voir table dans le commentaire d'intention).
  v_chakra := least(v_streak, 10) * 5;
  update public.profiles
     set chakra = chakra + v_chakra
   where id = p_user
  returning chakra into v_balance;

  return jsonb_build_object(
    'login_streak',  v_streak,
    'reward',        'chakra',
    'chakra_gained', v_chakra,
    'new_balance',   v_balance
  );
end;
$fn$;

-- ============================================================================
-- 7. Cosmétiques : buy_cosmetic / apply_cosmetic / reroll_cosmetic
-- ============================================================================

-- Achat : débit chakra ('INSUFFICIENT_CHAKRA' si solde insuffisant), ajout à
-- l'inventaire (on conflict = déjà possédé, achat idempotent sans double débit
-- impossible grâce au débit conditionnel RETURNING).
create or replace function public.buy_cosmetic(
  p_user uuid,
  p_cosmetic_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_price int;
  v_balance int;
  v_slug text;
begin
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'buy_cosmetic');
  if v_early is not null then
    return v_early;
  end if;

  select chakra_price, slug into v_price, v_slug
    from public.cosmetics
   where id = p_cosmetic_id;
  if not found then
    raise exception 'COSMETIC_NOT_FOUND';
  end if;

  update public.profiles
     set chakra = chakra - v_price
   where id = p_user
     and chakra >= v_price
  returning chakra into v_balance;
  if v_balance is null then
    raise exception 'INSUFFICIENT_CHAKRA';
  end if;

  insert into public.user_cosmetics (user_id, cosmetic_id)
  values (p_user, p_cosmetic_id)
  on conflict (user_id, cosmetic_id) do nothing;

  v_early := jsonb_build_object(
    'cosmetic_id', p_cosmetic_id,
    'slug',        v_slug,
    'chakra_price', v_price,
    'new_balance', v_balance
  );
  perform public._idempotency_store(p_idempotency_key, v_early);
  return v_early;
end;
$fn$;

-- Application sur une carte possédée : 'NOT_OWNER' si la carte n'est pas à
-- l'user OU si le cosmétique n'est pas dans son inventaire. Une seule
-- instance par type par carte : le slot (frame_id / holo_id / dye_id) est
-- remplacé — jamais deux frames simultanées.
create or replace function public.apply_cosmetic(
  p_user uuid,
  p_card_id uuid,
  p_cosmetic_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_type text;
  v_slug text;
begin
  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'apply_cosmetic');
  if v_early is not null then
    return v_early;
  end if;

  if not exists (select 1 from public.user_cards where id = p_card_id and user_id = p_user) then
    raise exception 'NOT_OWNER';
  end if;

  select type, slug into v_type, v_slug
    from public.cosmetics
   where id = p_cosmetic_id;
  if not found then
    raise exception 'COSMETIC_NOT_FOUND';
  end if;

  if not exists (select 1 from public.user_cosmetics where user_id = p_user and cosmetic_id = p_cosmetic_id) then
    raise exception 'NOT_OWNER';
  end if;

  if v_type = 'frame' then
    update public.user_cards set frame_id = p_cosmetic_id where id = p_card_id;
  elsif v_type = 'holo' then
    update public.user_cards set holo_id = p_cosmetic_id where id = p_card_id;
  elsif v_type = 'dye' then
    update public.user_cards set dye_id = p_cosmetic_id where id = p_card_id;
  else
    raise exception 'COSMETIC_NOT_FOUND';
  end if;

  v_early := jsonb_build_object(
    'card_id',     p_card_id,
    'cosmetic_id', p_cosmetic_id,
    'slug',        v_slug,
    'type',        v_type,
    'applied',     true
  );
  perform public._idempotency_store(p_idempotency_key, v_early);
  return v_early;
end;
$fn$;

-- Reroll : brûle l'instance appliquée sur la carte et en crédite une autre du
-- MÊME type, moyennant du chakra. Randomness EXCLUSIVEMENT serveur, seedée par
-- gen_random_uuid() (jamais d'input client dans le tirage).
create or replace function public.reroll_cosmetic(
  p_user uuid,
  p_card_id uuid,
  p_cosmetic_type text,
  p_idempotency_key uuid,
  p_cost int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_early jsonb;
  v_current uuid;
  v_new uuid;
  v_new_slug text;
  v_balance int;
begin
  if p_cosmetic_type not in ('frame', 'holo', 'dye') then
    raise exception 'COSMETIC_NOT_FOUND';
  end if;

  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'reroll_cosmetic');
  if v_early is not null then
    return v_early;
  end if;

  if not exists (select 1 from public.user_cards where id = p_card_id and user_id = p_user) then
    raise exception 'NOT_OWNER';
  end if;

  select case p_cosmetic_type
           when 'frame' then frame_id
           when 'holo'  then holo_id
           else dye_id
         end
    into v_current
    from public.user_cards
   where id = p_card_id;
  if v_current is null then
    raise exception 'NO_COSMETIC_TO_REROLL';
  end if;

  -- Dépense (insérée avant le tirage : en cas d'erreur tout rollback).
  update public.profiles
     set chakra = chakra - p_cost
   where id = p_user
     and chakra >= p_cost
  returning chakra into v_balance;
  if v_balance is null then
    raise exception 'INSUFFICIENT_CHAKRA';
  end if;

  -- Brûle l'instance appliquée sur la carte.
  if p_cosmetic_type = 'frame' then
    update public.user_cards set frame_id = null where id = p_card_id;
  elsif p_cosmetic_type = 'holo' then
    update public.user_cards set holo_id = null where id = p_card_id;
  else
    update public.user_cards set dye_id = null where id = p_card_id;
  end if;

  -- Crédite un autre cosmétique du même type (randomness serveur seedée
  -- par gen_random_uuid, excluant l'instance brûlée).
  select id, slug into v_new, v_new_slug
    from public.cosmetics
   where type = p_cosmetic_type
     and id <> v_current
   order by md5(gen_random_uuid()::text || id::text)
   limit 1;
  if v_new is null then
    raise exception 'EMPTY_POOL';
  end if;

  insert into public.user_cosmetics (user_id, cosmetic_id)
  values (p_user, v_new)
  on conflict (user_id, cosmetic_id) do nothing;

  v_early := jsonb_build_object(
    'card_id',          p_card_id,
    'cosmetic_type',    p_cosmetic_type,
    'burned_cosmetic',  v_current,
    'new_cosmetic',     v_new,
    'new_cosmetic_slug', v_new_slug,
    'chakra_cost',      p_cost,
    'new_balance',      v_balance
  );
  perform public._idempotency_store(p_idempotency_key, v_early);
  return v_early;
end;
$fn$;

-- ============================================================================
-- 8. toggle_wishlist — ajouter/retirer un perso de sa wishlist (10 slots max)
--
-- Intention : upsert/delete toggle. Cap 10 slots ('WISHLIST_FULL'),
-- incrément/décrément de characters.wishlist_count strictement couplés à
-- l'écriture effective (INSERT ... ON CONFLICT DO NOTHING RETURNING /
-- DELETE ... RETURNING) pour rester cohérent sous concurrence ; plancher 0.
-- La progression de quête 'wishlist_add' n'est comptée qu'à l'ajout effectif.
--
-- Préconditions d'atomicité : verrou advisory par user (sérialise les toggles
-- concurrents — sinon dépassement possible du cap 10) ; la pk
-- (user_id, character_id) interdit tout doublon.
-- ============================================================================
create or replace function public.toggle_wishlist(p_user uuid, p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inserted uuid;
  v_deleted uuid;
  v_count int;
begin
  if not exists (select 1 from public.characters where id = p_character_id) then
    raise exception 'CHARACTER_NOT_FOUND';
  end if;

  -- Sérialise les toggles du user (cap 10 strict même en rafale).
  perform pg_advisory_xact_lock(hashtextextended('wishlist:' || p_user::text, 0));

  insert into public.wishlists (user_id, character_id)
  values (p_user, p_character_id)
  on conflict (user_id, character_id) do nothing
  returning character_id into v_inserted;

  if v_inserted is not null then
    update public.characters
       set wishlist_count = wishlist_count + 1
     where id = p_character_id;
    perform public.update_quest_progress(p_user, 'wishlist_add', 1);
    select count(*) into v_count from public.wishlists where user_id = p_user;
    return jsonb_build_object('in_wishlist', true, 'wishlist_count', v_count);
  end if;

  delete from public.wishlists
   where user_id = p_user
     and character_id = p_character_id
  returning character_id into v_deleted;

  if v_deleted is not null then
    update public.characters
       set wishlist_count = greatest(wishlist_count - 1, 0) -- plancher 0
     where id = p_character_id;
  end if;

  select count(*) into v_count from public.wishlists where user_id = p_user;
  return jsonb_build_object('in_wishlist', false, 'wishlist_count', v_count);
end;
$fn$;

-- ============================================================================
-- Trigger de création de profil à l'inscription (search_path fixé — les
-- triggers sur auth.users sont un vecteur classique d'injection de search_path).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'full_name',
      'user_' || left(new.id::text, 8)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Permissions : EXECUTE révoqué par défaut (y compris au service_role via
-- PUBLIC), ré-accordé aux fonctions publiques pour authenticated ET
-- service_role (le service role est utilisé par scripts/dev-seed.ts et les
-- jobs serveur). Les helpers '_' et le trigger restent inaccessibles.
-- ============================================================================
revoke all on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function public.open_booster(uuid, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.open_premium_booster(uuid, uuid, jsonb, numeric) to authenticated, service_role;
grant execute on function public.claim_daily_pack(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.burn_card(uuid, uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_quest_progress(uuid, text, int) to authenticated, service_role;
grant execute on function public.ensure_daily_quests(uuid) to authenticated, service_role;
grant execute on function public.claim_quests(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.update_login_streak(uuid) to authenticated, service_role;
grant execute on function public.buy_cosmetic(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.apply_cosmetic(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.reroll_cosmetic(uuid, uuid, text, uuid, int) to authenticated, service_role;
grant execute on function public.toggle_wishlist(uuid, uuid) to authenticated, service_role;
