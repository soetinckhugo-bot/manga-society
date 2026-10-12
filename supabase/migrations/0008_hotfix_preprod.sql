-- ============================================================================
-- MANGA SOCIETY — HOTFIX PRÉ-PROD V1 (migration additive 0008, Agent 0)
--
-- Correctifs des trouvailles de l'audit Agent E (QA_REPORT.md), bloquant le
-- déploiement Vercel :
--   E-01 (P0) : aucune RPC ne vérifiait p_user = auth.uid() → n'importe quel
--               joueur authentifié agissait sur le compte d'un autre. Garde
--               ajoutée en TÊTE de TOUTES les RPC prenant p_user (0001, 0003,
--               0007), sans exception. Pattern (proposé par A, validé par 0) :
--               auth.uid() NULL (service_role : scripts/smoke/sim) → pass ;
--               JWT user avec p_user <> auth.uid() → 'FORBIDDEN'.
--   E-02 (P1) : toggle_wishlist n'appliquait jamais le cap 10 slots
--               ('WISHLIST_FULL' jamais levé). Cap appliqué, en paramètre
--               DEFAULT aligné sur lib/config.ts (wishlist.maxSlots).
--   E-03 (P1) : update_login_streak payait least(streak,10)*5 (J1 = 5) alors
--               que lib/config.ts (source de vérité, standard n°12) définit
--               chakraByDay [20,25,30,40,50,65,0] avec récompense cosmétique
--               au jour 7. Table portée en paramètres DEFAULT alignés.
--   E-04 (P1) : rachat d'un cosmétique déjà possédé = double débit silencieux
--               (buy_cosmetic débitait puis ON CONFLICT DO NOTHING absorbait
--               le doublon) ; reroll_cosmetic pouvait créditer un cosmétique
--               déjà possédé → débit sans contrepartie. Possession vérifiée
--               AVANT débit ('ALREADY_OWNED') ; le tirage de reroll exclut
--               l'inventaire du joueur (refus AVANT débit si tout est possédé).
--   E-07 (P1) : get_public_profile (0007) plantait 'column uc.rarity does
--               not exist' → page /u/[username] cassée. La rareté vit sur
--               characters.base_rarity : jointure corrigée.
--   E-05 (P2) : claim_daily_pack ne progressait pas la quête
--               'obtain_epic_plus' alors que ses 5 cartes sont Épique+.
--   E-08 (P1) : grants service_role du cloud incomplets (scripts cassés en
--               prod). Grants minimaux explicités en fin de fichier, calqués
--               sur l'usage réel des scripts/tests.
--   Robuste concurrence (trouvé en rejouant les tests E sur le cloud — les
--               deadlocks 40P01 existaient depuis 0001, jamais exécutés faute
--               de Docker) : (a) verrou de tête FOR UPDATE sur la ligne
--               profiles AVANT l'INSERT d'idempotence — la FK
--               idempotency_keys → profiles prend un verrou KEY SHARE
--               incompatible avec le FOR UPDATE de la recharge/débit, cycle
--               mortel sous N appels parallèles du même user ; (b) les 5
--               personnages d'une ouverture sont verrouillés DANS L'ORDRE
--               TRIÉ (_lock_characters_sorted) avant tout débit de print —
--               deux transactions ne peuvent plus s'attendre en croix sur
--               des lignes characters (AB-BA). Preuves :
--               tests/concurrency.test.ts (verts sur cloud et CI).
--
-- ADDITIF : create or replace uniquement (les 2 signatures enrichies de
-- paramètres DEFAULT donnent naissance à de nouvelles fonctions : les
-- anciennes sont DROPpées ici — elles seraient sinon restées appelables sans
-- garde E-01). Aucune migration passée n'est éditée. Les corps non cités
-- ci-dessus sont repris à l'identique de 0001/0003/0004/0007 (une seule
-- source de vérité par fonction : cette migration devient la référence
-- courante des corps recréés).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Garde d'autorisation E-01 (P0) — helper partagé par toutes les RPC.
--
-- Intention : un JWT utilisateur ne peut agir QUE pour son propre compte.
-- auth.uid() est NULL pour les appels service_role (clé service des scripts,
-- smoke engine, simulation économique) et pour anon : ces appels sont
-- inchangés. La garde est la PREMIÈRE instruction de chaque RPC publique,
-- avant toute écriture (y compris la ligne d'idempotence).
-- ---------------------------------------------------------------------------
create or replace function public._assert_self(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is not null and p_user <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
end;
$fn$;

revoke all on function public._assert_self(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 0bis. Verrouillage déterministe des personnages (anti-deadlock AB-BA).
--
-- Intention : le TIRAGE des personnages reste aléatoire, l'ORDRE DE
-- VERROUILLAGE ne l'est plus. Deux ouvertures concurrentes qui mettent à jour
-- print_count sur des lignes characters différentes dans un ordre aléatoire
-- peuvent s'attendre en croix (deadlock 40P01 détecté sous forte concurrence,
-- tests/concurrency.test.ts). Les ids étant verrouillés un par un, triés,
-- avant tout débit, l'ordre est global et déterministe : un cycle est
-- impossible. Les doublons du tableau (même perso sur 2 slots) sont sans
-- effet (verrou déjà détenu par la transaction).
-- ---------------------------------------------------------------------------
create or replace function public._lock_characters_sorted(p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  for v_id in select id from unnest(coalesce(p_ids, '{}'::uuid[])) as u(id) order by id
  loop
    perform 1 from public.characters where id = v_id for update;
  end loop;
end;
$fn$;

revoke all on function public._lock_characters_sorted(uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. RPC de mutation économie (0001, open_premium_booster au regard de 0004)
--    — recréées avec la garde E-01 en tête.
-- ---------------------------------------------------------------------------

-- 1.1 open_booster — garde E-01 ajoutée ; corps identique à 0001.
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
  v_char_ids uuid[] := array[]::uuid[];
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_epic_plus int;
  v_booster_count int;
  v_premium_points int;
  v_chakra int;
  v_cards_obtained int;
begin
  -- E-01 (P0) : le JWT appelant ne peut ouvrir que SON booster.
  perform public._assert_self(p_user);

  -- Verrou de tête sur le profil : sérialise les ouvertures du user ET
  -- prévient le deadlock idempotence↔recharge (la FK idempotency_keys →
  -- profiles prend un verrou KEY SHARE incompatible avec le FOR UPDATE de
  -- la recharge — cycle mortel sous N appels parallèles du même user).
  perform 1 from public.profiles where id = p_user for update;

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
      -- 0008 : due plafonné à 0. now() est figé au début de chaque transaction
      --     : une recharge concurrente (même requête, autre txn) peut avoir
      --     posé last_booster_recharge = now() avec un now() légèrement
      --     POSTÉRIEUR → floor() = -1 → un booster volé (least(10, count-1))
      --     et l'horodatage reculé de 6 min. Sous 10 opens parallèles d'un
      --     même user (stock pile = 10) → 1 NO_BOOSTER aléatoire. Bug
      --     pré-existant 0001, révélé par les tests de concurrence d'E.
      select greatest(0, floor(extract(epoch from (now() - last_booster_recharge)) / 360.0))::int as due
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

  -- (g) Tirage des 5 persos (lectures aléatoires, SANS verrou) puis
  --     verrouillage de leurs lignes DANS L'ORDRE TRIÉ (anti-deadlock AB-BA
  --     sur characters) et enfin attribution atomique des prints.
  foreach v_tier in array v_tiers loop
    v_char_ids := v_char_ids || array[public._pick_character(p_theme_slug, v_tier)];
  end loop;
  perform public._lock_characters_sorted(v_char_ids);
  foreach v_char_id in array v_char_ids loop
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

-- 1.2 open_premium_booster — corps de référence = 0004 (1 carte L min,
--     85/15), garde E-01 ajoutée. Signature inchangée (grants 0001 valides).
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
  -- E-01 (P0) : le JWT appelant ne peut dépenser que SES points.
  perform public._assert_self(p_user);

  -- Verrou de tête (anti-deadlock, cf. open_booster).
  perform 1 from public.profiles where id = p_user for update;

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

-- 1.3 claim_daily_pack — garde E-01 + E-05 : les 5 cartes (Épique min)
--     progressent aussi la quête 'obtain_epic_plus' (aligné sur open_booster).
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
  v_char_ids uuid[] := array[]::uuid[];
  v_char_id uuid;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_epic_plus int;
begin
  -- E-01 (P0) : le JWT appelant ne peut claim que SON pack du jour.
  perform public._assert_self(p_user);

  -- Verrou de tête (anti-deadlock, cf. open_booster).
  perform 1 from public.profiles where id = p_user for update;

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

  -- Tirage SANS verrou des 5 persos, puis verrouillage trié (anti-deadlock)
  -- et attribution atomique des prints.
  foreach v_tier in array v_tiers loop
    v_char_ids := v_char_ids || array[public._pick_character(v_theme_slug, v_tier)];
  end loop;
  perform public._lock_characters_sorted(v_char_ids);
  foreach v_char_id in array v_char_ids loop
    v_card := public._grant_card(p_user, v_char_id, 'daily');
    v_cards := v_cards || jsonb_build_array(v_card);
  end loop;

  perform public.update_quest_progress(p_user, 'claim_daily_pack', 1);

  -- E-05 : le pack du jour ne roll QUE des tiers Épique+ — ses cartes
  -- comptent pour la quête 'obtain_epic_plus' (cohérent avec open_booster).
  select count(*) into v_epic_plus
    from jsonb_array_elements(v_cards) as e
   where e->>'rarity' in ('epic', 'legendary', 'mythic');
  if v_epic_plus > 0 then
    perform public.update_quest_progress(p_user, 'obtain_epic_plus', v_epic_plus);
  end if;

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

-- 1.4 burn_card — garde E-01 ajoutée ; corps identique à 0001.
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
  -- E-01 (P0) : le JWT appelant ne peut brûler que SES cartes.
  perform public._assert_self(p_user);

  -- Verrou de tête (anti-deadlock, cf. open_booster).
  perform 1 from public.profiles where id = p_user for update;

  v_early := public._idempotency_begin(p_idempotency_key, p_user, 'burn_card');
  if v_early is not null then
    return v_early;
  end if;

  v_burn_table := coalesce(p_burn_table, '{"common":5,"uncommon":8,"rare":15,"epic":30,"legendary":80,"mythic":200}'::jsonb);

  -- Ownership + infos de valorisation (join characters pour wishlist_count).
  -- 0008 : correction d'un alias pré-existant 0001 (jamais exécuté avant la
  -- CI : sans Docker, burn_card levait 42703 'column c.base_rarity does not
  -- exist' à CHAQUE appel — c = user_cards n'a pas de base_rarity ; la
  -- rareté vit sur characters). Le burn était cassé depuis 0001.
  select ch.base_rarity, ch.wishlist_count into v_rarity, v_wishlist_count
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

-- 1.5 ensure_daily_quests — garde E-01 ajoutée ; corps identique à 0001.
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
  perform public._assert_self(p_user);

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

-- 1.6 update_quest_progress — garde E-01 ajoutée ; corps identique à 0001.
create or replace function public.update_quest_progress(p_user uuid, p_type text, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := public._paris_today();
begin
  perform public._assert_self(p_user);

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

-- 1.7 claim_quests — garde E-01 ajoutée ; corps identique à 0001.
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
  perform public._assert_self(p_user);

  -- Verrou de tête (anti-deadlock, cf. open_booster).
  perform 1 from public.profiles where id = p_user for update;

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

-- 1.8 update_login_streak — E-03 : table de récompense alignée sur
--     lib/config.ts (source de vérité, standard n°12), portée en paramètres
--     DEFAULT (duplication serveur autorisée — la config n'est jamais
--     exposée au client). Jour % p_cosmetic_reward_day = 0 → cosmétique
--     'streak-7' (seed 0002, slug conventionnel) ; sinon chakra lu dans
--     p_chakra_by_day, indexé de J1. Au-delà du dernier jour chakra
--     (p_cosmetic_reward_day - 1), plateau sur la dernière valeur chakra —
--     aucune valeur inventée hors config (l'ancien plafond 50/j disparaît).
create or replace function public.update_login_streak(
  p_user uuid,
  p_chakra_by_day int[] default '{20,25,30,40,50,65,0}',
  p_cosmetic_reward_day int default 7
)
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
  -- DEFAULT SQL ignoré si NULL passé explicitement : repli config.
  v_cosmetic_day int := greatest(coalesce(p_cosmetic_reward_day, 7), 1);
begin
  -- E-01 (P0) : le JWT appelant ne peut créditer que SON streak.
  perform public._assert_self(p_user);

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

  if v_streak % v_cosmetic_day = 0 then
    -- Récompense cosmétique du palier (slug conventionnel du seed).
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

  -- Chakra du jour : table de config, plateau après le dernier jour chakra.
  v_chakra := coalesce(p_chakra_by_day[least(v_streak, v_cosmetic_day - 1)], 0);
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

-- 1.9 buy_cosmetic — E-04 : la possession est vérifiée AVANT le débit.
--     L'ancien ordre (débit puis INSERT ... ON CONFLICT DO NOTHING) débitait
--     silencieusement le prix complet au rachat d'un cosmétique déjà possédé.
--     Verrou advisory : sérialise les achats du user (le pré-check + INSERT
--     forment une section critique), 'ALREADY_OWNED' = refus propre 409,
--     aucune écriture.
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
  -- E-01 (P0) : le JWT appelant ne peut acheter que pour SON compte.
  perform public._assert_self(p_user);

  -- Verrou de tête (anti-deadlock, cf. open_booster).
  perform 1 from public.profiles where id = p_user for update;

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

  -- E-04 : rachat = refus AVANT débit (double débit silencieux corrigé).
  perform pg_advisory_xact_lock(hashtextextended('shop:' || p_user::text, 0));
  if exists (select 1 from public.user_cosmetics where user_id = p_user and cosmetic_id = p_cosmetic_id) then
    raise exception 'ALREADY_OWNED';
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
  values (p_user, p_cosmetic_id);

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

-- 1.10 apply_cosmetic — garde E-01 ajoutée ; corps identique à 0001.
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
  -- E-01 (P0) : le JWT appelant ne peut décorer que SES cartes.
  perform public._assert_self(p_user);

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

-- 1.11 reroll_cosmetic — E-04 (reroll) : le tirage exclut désormais TOUT
--     l'inventaire du joueur pour le type (l'ancien tirage n'excluait que
--     l'instance brûlée : un cosmétique déjà possédé tombait sur
--     ON CONFLICT DO NOTHING → 25 chakra débités, slot brûlé, rien reçu).
--     Si tout le type est possédé : 'EMPTY_POOL' levé AVANT le débit (slot
--     et chakra préservés). Verrou advisory : sérialise les rerolls du user.
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
  -- E-01 (P0) : le JWT appelant ne peut reroll que SES cartes.
  perform public._assert_self(p_user);

  -- Verrou de tête (anti-deadlock, cf. open_booster).
  perform 1 from public.profiles where id = p_user for update;

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

  -- E-04 : section critique par user (le tirage dépend de l'inventaire).
  perform pg_advisory_xact_lock(hashtextextended('reroll:' || p_user::text, 0));

  -- Crédite un cosmétique du même type ni brûlé ni déjà possédé. Rien de
  -- disponible → refus AVANT débit (l'ancien code débitait puis échouait).
  select id, slug into v_new, v_new_slug
    from public.cosmetics as c
   where c.type = p_cosmetic_type
     and c.id <> v_current
     and not exists (select 1 from public.user_cosmetics as uc
                      where uc.user_id = p_user
                        and uc.cosmetic_id = c.id)
   order by md5(gen_random_uuid()::text || c.id::text)
   limit 1;
  if v_new is null then
    raise exception 'EMPTY_POOL';
  end if;

  -- Dépense (toute erreur après ce point rollback proprement).
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

  insert into public.user_cosmetics (user_id, cosmetic_id)
  values (p_user, v_new);

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

-- 1.12 toggle_wishlist — E-02 : cap 10 slots réellement appliqué
--     ('WISHLIST_FULL'), p_max_slots en paramètre DEFAULT aligné sur
--     lib/config.ts (wishlist.maxSlots). Le cap est contrôlé APRÈS l'INSERT
--     candidat et sous verrou advisory : en cas de dépassement le RAISE
--     rollback l'INSERT — la vérification reste exacte sous concurrence
--     (jamais 11 lignes commitées).
create or replace function public.toggle_wishlist(
  p_user uuid,
  p_character_id uuid,
  p_max_slots int default 10
)
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
  -- E-01 (P0) : le JWT appelant ne peut toggler que SA wishlist.
  perform public._assert_self(p_user);

  if not exists (select 1 from public.characters where id = p_character_id) then
    raise exception 'CHARACTER_NOT_FOUND';
  end if;

  -- Sérialise les toggles du user (cap strict même en rafale).
  perform pg_advisory_xact_lock(hashtextextended('wishlist:' || p_user::text, 0));

  insert into public.wishlists (user_id, character_id)
  values (p_user, p_character_id)
  on conflict (user_id, character_id) do nothing
  returning character_id into v_inserted;

  if v_inserted is not null then
    -- E-02 : le cap compte la ligne venant d'être insérée.
    select count(*) into v_count from public.wishlists where user_id = p_user;
    if v_count > coalesce(p_max_slots, 10) then
      raise exception 'WISHLIST_FULL'; -- rollback l'INSERT : jamais > cap.
    end if;
    update public.characters
       set wishlist_count = wishlist_count + 1
     where id = p_character_id;
    perform public.update_quest_progress(p_user, 'wishlist_add', 1);
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

-- ---------------------------------------------------------------------------
-- 2. RPC de lecture (0003) — recréées avec la garde E-01 en tête. Une lecture
--    SECURITY DEFINER cross-user (collection de B lue par A) est une fuite :
--    même traitement que les mutations.
-- ---------------------------------------------------------------------------

-- 2.1 get_booster_state — corps identique à 0003 + garde E-01.
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
  perform public._assert_self(p_user);

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

-- 2.2 get_collection_page — corps identique à 0003 + garde E-01.
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
  perform public._assert_self(p_user);

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

-- 2.3 get_album — corps identique à 0003 + garde E-01.
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
  perform public._assert_self(p_user);

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

-- 2.4 get_card_detail — corps identique à 0003 + garde E-01.
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
  perform public._assert_self(p_user);

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

-- 2.5 get_daily_quests — corps identique à 0003 + garde E-01.
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
  perform public._assert_self(p_user);

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

-- 2.6 get_wishlist — corps identique à 0003 + garde E-01.
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
  perform public._assert_self(p_user);

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

-- 2.7 get_theme_pool_info — corps identique à 0003 + garde E-01.
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

-- ---------------------------------------------------------------------------
-- 3. RPC profil (0007) — set_username / set_showcase : garde E-01.
--    get_public_profile : E-07 — la requête de 'highest_rarity' référençait
--    uc.rarity (absente de user_cards) : la rareté vit sur
--    characters.base_rarity (join ajouté). check_username n'a pas de p_user
--    (lecture publique de disponibilité) : inchangé.
-- ---------------------------------------------------------------------------

-- 3.1 set_username — corps identique à 0007 + garde E-01.
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
  -- E-01 (P0) : le JWT appelant ne peut renommer que SON profil.
  perform public._assert_self(p_user);

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

-- 3.2 set_showcase — corps identique à 0007 + garde E-01.
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
  -- E-01 (P0) : le JWT appelant ne peut modifier que SA vitrine.
  perform public._assert_self(p_user);

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

-- 3.3 get_public_profile — E-07 : jointure characters pour la rareté.
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

  -- E-07 : la rareté vit sur characters.base_rarity (user_cards n'a pas de
  -- colonne rarity). Tie-break : plus petit print.
  select c.base_rarity into v_highest
    from public.user_cards as uc
    join public.characters as c on c.id = uc.character_id
   where uc.user_id = v_profile.id
   order by public._rarity_rank(c.base_rarity) desc, uc.print_number asc
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

-- ---------------------------------------------------------------------------
-- 4. Permissions.
--
-- 4a. Signatures enrichies (paramètres DEFAULT) : les ANCIENNES fonctions
--     resteraient appelables SANS garde E-01 si on ne les supprimait pas.
-- 4b. Grants EXECUTE des nouvelles signatures.
-- 4c. E-08 : grants TABLE service_role — audit complet grants vs migrations :
--     la stack locale (`supabase start`) donne tout au service_role (les
--     tests passaient en CI malgré le trou) ; le cloud ne grantait que
--     characters (0006). Cette section accorde le MINIMUM réellement utilisé
--     par les scripts/tests (recensement : scripts/dev-seed.ts,
--     scripts/smoke-engine.test.ts, tests/helpers.ts, pipeline/db.ts) :
--       * profiles  : SELECT/INSERT/UPDATE — fixtures QA, refill du smoke
--                     (UPDATE last_booster_recharge), création de profil.
--       * characters: DELETE ajouté au SELECT/INSERT/UPDATE de 0006 — purge
--                     physique des fixtures QA (validée orchestrateur) ;
--                     nettoyage cleanup() des tests.
--       * themes    : SELECT/INSERT/UPDATE/DELETE — thèmes dédiés QA
--                     (upsert qa-solo, nettoyage).
--       * user_cards: SELECT — relecture des prints (smoke/concurrence).
--       * wishlists : SELECT — readbacks QA.
--       * user_quests: SELECT/INSERT/UPDATE/DELETE — fixtures QA (impose les
--                     quêtes du jour) + nettoyage.
--       * user_cosmetics: SELECT — vérification récompense streak/inventaire.
--       * cosmetics / quests : SELECT — lectures pipeline/QA.
--       * drops_log : SELECT — audit smoke (comptage).
--     Aucune économie n'est ouverte en écriture hors RPC : print_count /
--     wishlist_count / compteurs restent mutés UNIQUEMENT par les fonctions
--     SECURITY DEFINER (grants 0000 inchangés).
-- ---------------------------------------------------------------------------

drop function if exists public.toggle_wishlist(uuid, uuid);
drop function if exists public.update_login_streak(uuid);

grant execute on function public.update_login_streak(uuid, int[], int) to authenticated, service_role;
grant execute on function public.toggle_wishlist(uuid, uuid, int) to authenticated, service_role;

-- E-08 (voir 4c) — grants TABLE minimal du service_role, cloud == local.
grant select, insert, update on public.profiles to service_role;
grant delete on public.characters to service_role;
grant select, insert, update, delete on public.themes to service_role;
grant select on public.user_cards to service_role;
grant select on public.wishlists to service_role;
grant select, insert, update, delete on public.user_quests to service_role;
grant select on public.user_cosmetics to service_role;
grant select on public.cosmetics to service_role;
grant select on public.quests to service_role;
grant select on public.drops_log to service_role;
