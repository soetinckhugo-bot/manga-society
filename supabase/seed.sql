-- ============================================================================
-- MANGA SOCIETY — seed : thèmes, cosmétiques, pool de quêtes quotidiennes
--
-- Idempotent : ON CONFLICT (clé naturelle) DO NOTHING (les uuid sont générés
-- par gen_random_uuid(), re-jouer le seed ne duplique rien).
-- Le pool de personnages (characters) est rempli par le pipeline AniList/
-- Jikan (Agent Data Pipeline) ; scripts/dev-seed.ts crée quelques persos de
-- test en local UNIQUEMENT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Thèmes (6 univers). sort_order pilote l'affichage ET la rotation du pack
-- du jour (offset = nb de jours depuis epoch % nb de thèmes).
-- ----------------------------------------------------------------------------
insert into public.themes (slug, name_fr, name_en, icon, pack_art_url, sort_order) values
  ('shonen',  'Shonen',   'Shonen',   'flame',    '/packs/shonen.png',  0),
  ('shojo',   'Shojo',    'Shojo',    'flower-2', '/packs/shojo.png',   1),
  ('webtoon', 'Webtoon',  'Webtoon',  'smartphone', '/packs/webtoon.png', 2),
  ('big3',    'Big 3',    'Big 3',    'crown',    '/packs/big3.png',    3),
  ('seinen',  'Seinen',   'Seinen',   'moon',     '/packs/seinen.png',  4),
  ('isekai',  'Isekai',   'Isekai',   'sparkles', '/packs/isekai.png',  5)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Cosmétiques (~16 : 6 frames dont streak-7, 5 holos, 5 dyes).
-- css_config = tokens CSS consommés par le composant carte (Agent Juice) :
-- jamais de code par cosmétique, uniquement des tokens (couleurs, gradients,
-- animations). Les animations restent transform/opacity (perf budget).
-- ----------------------------------------------------------------------------
insert into public.cosmetics (slug, type, name_fr, name_en, chakra_price, is_ultra_rare, css_config) values

  -- FRAMES (cadres posés par-dessus le cadre de base)
  ('frame-bronze',   'frame', 'Cadre Bronze',      'Bronze Frame',      150,  false,
   '{"borderWidth":"3px","borderStyle":"solid","borderRadius":"12px","borderColor":"#b08d57","boxShadow":"0 0 8px rgba(176,141,87,.35)","animation":"none"}'),
  ('frame-silver',   'frame', 'Cadre Argent',      'Silver Frame',      300,  false,
   '{"borderWidth":"3px","borderStyle":"solid","borderRadius":"12px","borderColor":"#c0c6d1","boxShadow":"0 0 10px rgba(192,198,209,.4)","animation":"none"}'),
  ('frame-gold',     'frame', 'Cadre Or',          'Gold Frame',        800,  false,
   '{"borderWidth":"3px","borderStyle":"solid","borderRadius":"12px","borderColor":"#f5c542","boxShadow":"0 0 14px rgba(245,197,66,.5), inset 0 0 6px rgba(245,197,66,.25)","animation":"none"}'),
  ('frame-obsidian', 'frame', 'Cadre Obsidienne',  'Obsidian Frame',    1500, true,
   '{"borderWidth":"3px","borderStyle":"solid","borderRadius":"12px","borderColor":"#1a1a22","boxShadow":"0 0 16px rgba(120,80,255,.45), inset 0 0 8px rgba(0,0,0,.6)","animation":"frame-pulse 3s ease-in-out infinite"}'),
  ('frame-sakura',   'frame', 'Cadre Sakura',      'Sakura Frame',      1200, true,
   '{"borderWidth":"3px","borderStyle":"solid","borderRadius":"12px","borderColor":"#f6a5c0","boxShadow":"0 0 12px rgba(246,165,192,.5)","animation":"frame-breathe 4s ease-in-out infinite"}'),
  -- Récompense de streak (jour 7) : convention findable par slug, non achetable.
  ('streak-7',       'frame', 'Cadre Fidélité',    'Loyalty Frame',     0,    true,
   '{"borderWidth":"4px","borderStyle":"double","borderRadius":"12px","borderColor":"#7dd3fc","boxShadow":"0 0 16px rgba(125,211,252,.55), inset 0 0 6px rgba(125,211,252,.3)","animation":"frame-breathe 3s ease-in-out infinite"}'),

  -- HOLOS (irisés animés au survol, subtils au repos)
  ('holo-rainbow', 'holo', 'Holo Arc-en-ciel', 'Rainbow Holo', 1000, false,
   '{"gradient":"linear-gradient(135deg, rgba(255,0,128,.16), rgba(0,180,255,.16), rgba(255,220,0,.16))","blendMode":"overlay","hoverAnimation":"holo-sweep 3s linear infinite"}'),
  ('holo-moon',    'holo', 'Holo Lune',        'Moon Holo',    700,  false,
   '{"gradient":"linear-gradient(160deg, rgba(148,163,255,.20), rgba(30,41,59,.05))","blendMode":"screen","hoverAnimation":"holo-sweep 4s linear infinite"}'),
  ('holo-gold',    'holo', 'Holo Doré',        'Golden Holo',  1400, true,
   '{"gradient":"linear-gradient(135deg, rgba(245,197,66,.22), rgba(255,255,255,.06), rgba(245,197,66,.18))","blendMode":"overlay","hoverAnimation":"holo-sweep 2.5s linear infinite"}'),
  ('holo-void',    'holo', 'Holo Néant',       'Void Holo',    1800, true,
   '{"gradient":"radial-gradient(circle at 30% 20%, rgba(120,80,255,.28), transparent 60%)","blendMode":"screen","hoverAnimation":"holo-sweep 5s linear infinite"}'),
  ('holo-sakura',  'holo', 'Holo Sakura',      'Sakura Holo',  900,  false,
   '{"gradient":"linear-gradient(150deg, rgba(246,165,192,.20), rgba(255,255,255,.04))","blendMode":"soft-light","hoverAnimation":"holo-sweep 3.5s linear infinite"}'),

  -- DYES (teinte blend-mode sur l'image)
  ('dye-crimson',  'dye', 'Teinte Cramoisi', 'Crimson Dye',  400, false,
   '{"tintColor":"rgba(220,38,38,.18)","blendMode":"multiply"}'),
  ('dye-ocean',    'dye', 'Teinte Océan',    'Ocean Dye',    400, false,
   '{"tintColor":"rgba(14,116,233,.18)","blendMode":"multiply"}'),
  ('dye-emerald',  'dye', 'Teinte Émeraude', 'Emerald Dye',  400, false,
   '{"tintColor":"rgba(16,163,127,.18)","blendMode":"multiply"}'),
  ('dye-twilight', 'dye', 'Teinte Crépuscule','Twilight Dye',650, false,
   '{"tintColor":"rgba(124,58,237,.20)","blendMode":"overlay"}'),
  ('dye-mono',     'dye', 'Teinte N&B',      'Monochrome Dye', 350, false,
   '{"tintColor":"rgba(0,0,0,.10)","blendMode":"saturation"}')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Pool de quêtes quotidiennes (3 random parmi les actives, génération côté
-- serveur dans ensure_daily_quests). Types progressés par les RPC :
--   open_boosters | burn_cards | obtain_epic_plus | wishlist_add | claim_daily_pack
-- ----------------------------------------------------------------------------
insert into public.quests (key, type, goal, chakra_reward, name_fr, name_en, active) values
  ('daily-open-5-boosters',  'open_boosters',    5,  50,
   'Ouvre 5 boosters',                     'Open 5 boosters',                       true),
  ('daily-open-10-boosters', 'open_boosters',    10, 120,
   'Ouvre 10 boosters',                    'Open 10 boosters',                      true),
  ('daily-burn-3',           'burn_cards',       3,  40,
   'Brûle 3 cartes',                       'Burn 3 cards',                          true),
  ('daily-burn-5',           'burn_cards',       5,  70,
   'Brûle 5 cartes',                       'Burn 5 cards',                          true),
  ('daily-obtain-epic-plus', 'obtain_epic_plus', 1,  60,
   'Obtiens une carte Épique ou supérieure','Obtain an Epic card or higher',        true),
  ('daily-wishlist-2',       'wishlist_add',     2,  25,
   'Ajoute 2 personnages à ta wishlist',   'Add 2 characters to your wishlist',     true),
  ('daily-claim-pack',       'claim_daily_pack', 1,  30,
   'Réclame ton pack du jour',             'Claim your daily pack',                 true)
on conflict (key) do nothing;
