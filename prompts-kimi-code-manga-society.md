# PROMPTS KIMI CODE — MANGA SOCIETY
## Jeu de collection de cartes anime — boosters, double rareté (perso + print Karuta), cosmétiques
> Ordre d'exécution : Prompt 0 (Architecte) → A + B + C en parallèle → D + E en parallèle.
> Chaque agent lit `SPEC.md` et `supabase/schema.sql` produits par l'Agent 0 avant de coder.
> V2 (exclu du MVP) : feed "Gros tirages" en direct, classement, enchères/marché, parrainage,
> bannières limitées à taux augmenté, traduction des descriptions persos, push notifications.

---

## RÉCAP DES DÉCISIONS VERROUILLÉES (référence commune)

**Concept** : Site web gratuit de collection de cartes de persos anime/manga. Pas de combat,
pas de stats POW/AURA. Le fun = ouvrir des boosters, compléter l'album, chasser les prints
bas et les persos populaires.

**PRODUIT = SITE WEB INSTALLABLE (PWA), PAS UNE APP DISCORD.** Aucun bot, aucune gateway
Discord : Discord n'est qu'une méthode de login OAuth parmi email magic link. Le site doit
être installable comme une app (manifest, icônes maskable, service worker, bannière
d'installation façon Kyara, plein écran une fois installé).

**Double rareté** :
1. **Rareté du personnage** (intrinsèque) : **6 tiers** — Common (C), Uncommon (U),
   Rare (R), Epic (E), Legendary (L), Mythic (M). Calculée au lancement par percentile de
   `favourites` AniList sur le pool (top 1% Mythic, 1→5% Legendary, 5→20% Epic, 20→45% Rare,
   45→75% Uncommon, reste Common), overridable manuellement par perso
   (`rarity_overridden = true`).
2. **Print Karuta** (par instance) : chaque carte possédée a un `print_number` unique et
   séquentiel **par personnage** (le Goku #1, le Luffy #1…). PAS de numéro global — ce qui
   compte c'est "c'est le print #N du perso, et il en existe print_count exemplaires".
   Gravé à l'obtention, atomique, jamais recyclé. Purement visuel/prestige.
3. **First owner** : badge "Premier détenteur" si la carte a été obtenue par le joueur
   lui-même dans un booster (`first_owner = true` si source = 'booster'/'premium'/'daily',
   false pour quêtes/cadeaux).

**Cadre visuel** : image perso + **cadre de base par rareté** (6 déclinaisons, codes couleur
type TCG : gris C / vert U / bleu R / violet E / or L / rouge-noir M — sobre et premium)
+ **badge print visible** (doré animé #1-10, argent #11-100, sobre au-delà) + badge
"Nouveau" au reveal + cosmétiques optionnels (frame / holo / dye).

**Économie** :
- Booster gratuit : 5 cartes, thème au choix (Shonen, Shojo, Webtoon, Big 3, Seinen,
  Isekai). Recharge +1 toutes les 6 min, stock max 10.
- Tirage : roll pondéré par carte (défaut : C 55% / U 25% / R 12% / E 5% / L 2.4% / M 0.6%,
  ajustable), perso uniforme dans le tier ET le thème.
- **Pity visible** (comme Kyara "Mythique garantie dans 195 boosters au plus") : Légendaire
  garanti au plus tous les 25 boosters, Mythique au plus tous les 200. Compteurs affichés
  sur la page boosters et dans l'écran d'ouverture. Un pity déclenché reset son compteur.
- **Booster doré** : tous les 10 boosters ouverts → l'ouverture suivante est dorée
  (taux ×2, compteur visible "X/10 avant le doré"). Compte dans le pity. Configurable.
- **Pack du jour** : gratuit, 1/jour, thème rotatif, **Épique garantie minimum** sur les 5
  cartes (roll uniquement dans les tiers E et au-dessus). Bouton grisé une fois claim.
- **Chakra** (monnaie douce) : burn de doublons, quêtes quotidiennes, série de connexion
  (jour 7 = cosmétique). Dépensé en cosmétiques (frame/holo/dye) et reroll cosmétique.
- Valeur de burn : base par rareté (C 5 / U 8 / R 15 / E 30 / L 80 / M 200) × multiplicateur
  de demande `1 + min(wishlist_count / 1000, 2)` (mécanique Karuta : brûler un perso
  convoité rapporte plus).
- **Monnaie unique** (points premium) : +1 point toutes les 100 cartes obtenues.
  10 points = booster premium garantissant **1 carte Légendaire minimum** (roll interne
  85% L / 15% M — ajustable).
- **Quêtes** : 3 quotidiennes random parmi un pool (ex : ouvrir 5 boosters, burner 3 cartes,
  obtenir une Épique+, ajouter 2 persos à ta wishlist), récompense chakra.
- **Wishlist** : 10 slots max par joueur. Sur la page booster : "X de tes envies dans ce
  booster" (persos de la wishlist présents dans le pool du thème).
- **Album mode** (V1) : la collection a un mode album — les persos non possédés apparaissent
  en silhouette numérotée, groupés par anime.

**Stack** : Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Supabase (Postgres +
Auth email magic link + Discord OAuth + Realtime), Vercel, next-intl (FR/EN), Zod.
Pas de monnaie payante, pas de PvP, pas de stats.

**Design** : inspiré de Kyara (dark, cartes premium) mais clean — pas de néon partout.
Scènes signature : l'ouverture de booster (déchirure + reveal) et le profil/collection.
**Assets visuels** : frames/badges/holo/dye = CSS pur (paramétré par `css_config`).
Pack art des boosters + verso des cartes = IMAGES GÉNÉRÉES PAR IA (prompts fournis dans le
prompt de l'Agent D). Sons = fichiers CC0 locaux. Icons = lucide-react.

---

## STANDARDS COMMUNS — TOUS LES AGENTS (non négociables)

```
1. TypeScript strict + noUncheckedIndexedAccess. Zéro `any` (eslint `@typescript-eslint/
   no-explicit-error` / no-unsafe-* en erreur). Types DB générés : `supabase gen types
   typescript --local` → `types/database.ts`, jamais de type inline dupliqué.
2. Schémas Zod partagés client/serveur dans `lib/validations/` (les routes API et les
   forms importent le MÊME schéma). Codes d'erreur métier : enum string union partagé
   dans `lib/errors.ts`, JAMAIS de message d'erreur ad hoc.
3. Économie 100 % serveur : toute mutation (boosters, cartes, chakra, points, pity,
   streak) passe par RPC Postgres SECURITY DEFINER. Jamais d'update direct, jamais de
   calcul client. RLS en deny-by-default sur TOUTES les tables.
4. **Idempotence** : toute mutation d'économie accepte un `idempotency_key uuid`
   (généré côté client À CHAQUE tentative de clic, pas par session). Table
   `idempotency_keys` (key pk, user_id, endpoint, result jsonb, created_at) ; la RPC
   insère ON CONFLICT (key) DO NOTHING et retourne le résultat existant. Double-clic,
   retry réseau et refresh pendant la requête doivent être sans effet. Le rate limiting
   reste, en complément (ceinture ET bretelles).
5. Dates serveur = NOW() Postgres. Resets quotidiens (quêtes, pack du jour, streak) en
   timezone Europe/Paris (config serveur), jamais l'horloge client.
6. Atomicité print : `UPDATE characters SET print_count = print_count + 1 ... RETURNING`
   — la contrainte unique (character_id, print_number) sur user_cards est le filet de
   sécurité ultime. Toute fonction d'ouverture = UNE transaction.
7. Tests : exécutés sur Supabase LOCAL (`supabase start`), jamais sur la prod. Un agent
   livre des tests qui passent en CI, pas "à la main".
8. Git : conventional commits, un agent = une branche `agent/<scope>`, PR vers `main`,
   CI verte obligatoire. `.github/workflows/ci.yml` : lint → typecheck → build → tests
   (avec `supabase start` + migrations + seed). Pas de merge à CI rouge.
9. Perf budgets : first-load JS < 200KB gzip par route publique ; LCP < 2.5s en 4G
   simulée ; animations UNIQUEMENT transform/opacity (pas de layout thrash) ;
   `prefers-reduced-motion` respecté partout. next/image avec remotePatterns configurés.
10. i18n : next-intl, messages/fr.json + messages/en.json complets, zéro literal UI.
11. Secrets : service role key UNIQUEMENT dans les route handlers serveur. Aucun secret
    dans le client bundle (vérifier avec `next build` + scan).
12. `lib/config.ts` = source unique de vérité de l'équilibrage (poids, pity, burn, prix).
    Si une valeur est en dur ailleurs → refus de review.
13. Chaque agent écrit sa doc de main dans `HANDOFF.md` (racine) : ce qui est fait, ce
    qui est manquant, les décisions prises, les dettes. Les agents suivants lisent tous
    les HANDOFF.md avant de commencer.
```

---

## PROMPT 0 — AGENT ARCHITECTE

```
Tu es l'architecte senior d'un jeu web de collection de cartes anime nommé MANGA SOCIETY.
Tu ne codes aucune feature. Tu produis les fondations sur lesquelles 5 autres agents
vont travailler EN PARALLÈLE sans se marcher dessus, et tu es responsable du fait qu'un
agent qui n'a JAMAIS parlé au client puisse livrer sa feature rien qu'avec tes documents.

CONTEXTE MÉTIER (résumé) :
- Site PWA gratuit de collection : boosters à thème (5 cartes), recharge +1/6min stock
  max 10. Installable (manifest, service worker, bannière d'install).
- 6 raretés de personnage (common→mythic) calculées par percentile de popularité AniList,
  overridables. Print Karuta : séquentiel unique PAR PERSONNAGE (atomique, jamais
  recyclé). Badge first_owner. AUCUN numéro global.
- Pity visible (L ≤ 25 boosters, M ≤ 200), booster doré tous les 10 (taux ×2), pack du
  jour gratuit 1/jour (Épique min). Économie : chakra (burn × demande wishlist, quêtes,
  streak J7), points premium (+1/100 cartes, 10 pts = carte Légendaire min), wishlist 10
  slots, album mode.
- Auth : Supabase Auth (email magic link + Discord OAuth — Discord n'est QUE du login,
  pas de bot, pas d'app Discord).
- Pas de combat, pas de stats, pas de monnaie réelle. i18n FR/EN. Stack : Next.js App
  Router + Supabase + Vercel.

LIVRABLES (dans cet ordre) :
1. `SPEC.md` : architecture détaillée (arborescence complète des routes et des dossiers
   `app/`, `components/`, `lib/`, `types/`, `supabase/`), cartographie agent → fichiers
   (quel agent possède quel périmètre — les frontières DOIVENT être disjointes), les
   flux métier en séquence (open booster avec idempotency, burn, daily pack, streak,
   quêtes), et le référentiel de décisions d'architecture dans `docs/adr/` (3 ADR max :
   pourquoi Supabase, pourquoi l'idempotency côté SQL, pourquoi PWA plutôt qu'app
   native).
2. `lib/config.ts` : TOUTES les constantes d'équilibrage typées et commentées (poids des
   6 raretés, pity, doré, recharge, burn table, multiplicateur wishlist, roll premium,
   seuils visuels print, cap wishlist, cadence quêtes). Source unique de vérité.
3. `lib/errors.ts` : l'enum partagé de tous les codes d'erreur métier ('NO_BOOSTER',
   'INVALID_THEME', 'NOT_ENOUGH_POINTS', 'ALREADY_CLAIMED', 'WISHLIST_FULL',
   'RATE_LIMITED', 'NOT_OWNER', 'INSUFFICIENT_CHAKRA', …). Le client traduit, jamais le
   serveur ne formate de message.
4. `lib/validations/` : les schémas Zod partagés (OpenBoosterInput, BurnInput,
   WishlistToggleInput, BuyCosmeticInput, …).
5. `supabase/schema.sql` : schéma Postgres COMPLET ci-dessous + RLS policies sur TOUTES
   les tables + contraintes (notamment `unique(character_id, print_number)` sur
   user_cards) + index (tous les filtres de la collection : user_id+obtained_at,
   character_id+base_rarity, themes GIN, lower(name_romaji) trigram pour la recherche).
6. `supabase/migrations/0001_functions.sql` : les fonctions SQL critiques (détaillées
   plus bas), idempotentes, chacune avec un commentaire d'intention et sa précondition
   d'atomicité. `create extension if not exists pgcrypto` pour les uuid client.
7. `supabase/seed.sql` : 6 thèmes, ~15 cosmétiques, pool de quêtes, et un script
   `scripts/dev-seed.ts` créant 2 users de test avec quelques cartes (dev local uniquement,
   documenté).
8. `types/database.ts` : types générés (`supabase gen types typescript --local`) +
   `types/api.ts` : les contrats de réponse de chaque route (les agents A et B codent
   contre CE fichier, pas l'inverse).
9. `.github/workflows/ci.yml` : lint → typecheck → `supabase start` → migrations → seed
   → tests. Rouge = pas de merge.
10. `.env.example` : toutes les variables (Supabase URL/anon/service role, Discord OAuth
    client id/secret, NEXT_PUBLIC_SITE_URL).
11. `public/manifest.webmanifest` + icônes (placeholder accepté, specs : 192, 512,
    maskable) : name "Manga Society", short_name "Manga Society", display
    "standalone", background/theme color du design system, start_url "/", icons.
    Politique service worker documentée dans SPEC.md (recommandation : @serwist/next —
    precache du shell, runtime cache StaleWhileRevalidate pour les images AniList avec
    expiration 200 entrées, activation skipWaiting + clientsClaim, registration UNIQUEMENT
    en prod, page offline dédiée).

SCHÉMA BDD ATTENDU (tu peux l'améliorer mais pas le réduire) :
- characters(id uuid default gen_random_uuid() pk, anilist_id int unique, name_romaji
  text not null, name_native text, image_url text not null, image_url_fallback text,
  anime_title text, favourites int default 0, base_rarity text not null check (base_rarity
  in ('common','uncommon','rare','epic','legendary','mythic')), rarity_overridden bool
  default false, themes text[] not null default '{}', print_count int not null default 0,
  wishlist_count int not null default 0)
- themes(slug text pk, name_fr, name_en, icon, pack_art_url text, sort_order int)
- profiles(id uuid pk references auth.users on delete cascade, username citext unique,
  chakra int not null default 0, premium_points int not null default 0,
  booster_count int not null default 10, last_booster_recharge timestamptz not null
  default now(), cards_obtained_count int not null default 0, pity_legendary int not null
  default 0, pity_mythic int not null default 0, golden_counter int not null default 0,
  login_streak int not null default 0, last_login_date date, daily_pack_claimed date,
  created_at timestamptz not null default now())
- user_cards(id uuid default gen_random_uuid() pk, user_id uuid not null references
  profiles(id) on delete cascade, character_id uuid not null references characters(id),
  print_number int not null, first_owner bool not null default true, frame_id uuid
  references cosmetics(id), holo_id uuid references cosmetics(id), dye_id uuid references
  cosmetics(id), source text not null check (source in ('booster','premium','daily',
  'quest')), obtained_at timestamptz not null default now(),
  unique(character_id, print_number))
- cosmetics(id uuid default gen_random_uuid() pk, type text not null check (type in
  ('frame','holo','dye')), name_fr text not null, name_en text not null, chakra_price int
  not null, is_ultra_rare bool not null default false, css_config jsonb not null)
- user_cosmetics(user_id uuid references profiles(id) on delete cascade, cosmetic_id uuid
  references cosmetics(id), obtained_at timestamptz not null default now(),
  pk(user_id, cosmetic_id))
- wishlists(user_id uuid references profiles(id) on delete cascade, character_id uuid
  references characters(id) on delete cascade, added_at timestamptz not null default
  now(), pk(user_id, character_id))
- quests(id uuid default gen_random_uuid() pk, key text unique not null, type text not
  null, goal int not null, chakra_reward int not null, name_fr text not null, name_en
  text not null, active bool not null default true)
- user_quests(user_id uuid references profiles(id) on delete cascade, quest_id uuid
  references quests(id), progress int not null default 0, completed bool not null default
  false, claimed bool not null default false, day date not null, pk(user_id, quest_id, day))
- drops_log(id bigint generated always as identity pk, user_id uuid not null, character_id
  uuid not null, rarity text not null, print_number int not null, source text not null,
  created_at timestamptz not null default now())
- idempotency_keys(key uuid pk, user_id uuid not null references profiles(id) on delete
  cascade, endpoint text not null, result jsonb, created_at timestamptz not null default
  now())
- booster_openings(id uuid default gen_random_uuid() pk, user_id uuid not null, theme_slug
  text, is_golden bool not null default false, pity_legendary_after int, pity_mythic_after
  int, created_at timestamptz not null default now())

FONCTIONS SQL CRITIQUES (obsessionnel sur l'atomicité et l'idempotence) :
1. `open_booster(p_user uuid, p_theme_slug text, p_idempotency_key uuid)` : SECURITY
   DEFINER, SET search_path. D'abord : `INSERT INTO idempotency_keys ... ON CONFLICT (key)
   DO NOTHING` ; si conflit → retourner le résultat stocké (early return, idempotent).
   Sinon : (a) recharge due (last_booster_recharge, CAP 10 — la logique de recharge ne
   vit QUE là) ; (b) pity_legendary++ et pity_mythic++ ; si pity_legendary >= 25 → au
   moins 1 carte L (reset à 0), si pity_mythic >= 200 → au moins 1 carte M (reset) ;
   (c) doré : si golden_counter >= 9 → is_golden (taux ×2, reset 0) sinon ++ ; (d) check
   booster_count > 0 (erreur 'NO_BOOSTER') puis décrémente ; (e) roll 5 raretés pondérées
   (depuis lib/config.ts dupliqué en parametre avec defaults SQL — les poids sont passés
   en arguments avec DEFAULT pour rester configurables), tirage perso uniforme par tier
   DANS le thème ; (f) pour chaque carte : `UPDATE characters SET print_count =
   print_count + 1 WHERE id = ... RETURNING print_count` (ATOMIQUE — jamais deux fois le
   même print) ; (g) insert user_cards (first_owner = true), increments
   cards_obtained_count et premium_points (+1 par tranche de 100), progression quêtes,
   drops_log, booster_openings ; (h) stocker le résultat dans idempotency_keys.result.
   TOUT dans UNE transaction ; tout raise rollback proprement.
2. `open_premium_booster(p_user uuid, p_idempotency_key uuid)` : idem, 1 carte Légendaire
   minimum (roll 85% L / 15% M, configurable), dépense 10 points, source 'premium',
   compte dans pity ET golden.
3. `claim_daily_pack(p_user uuid, p_idempotency_key uuid)` : 1/jour (daily_pack_claimed =
   current_date à Europe/Paris — configurer le timezone de la DB, sinon comparer
   (now() at time zone 'Europe/Paris')::date ; erreur 'ALREADY_CLAIMED'). Thème du jour =
   rotation déterministe (sort_order, nb de jours depuis epoch). 5 cartes rollées
   UNIQUEMENT dans les tiers E+ (poids renormalisés), source 'daily', gratuit (ni
   booster ni point), compte dans pity ET golden.
4. `burn_card(p_user uuid, p_card_id uuid, p_idempotency_key uuid)` : ownership check
   ('NOT_OWNER'), delete, crédit chakra = table de burn[rareté] × (1 + min(wishlist_count/
   1000, 2)), progression quêtes burn.
5. `update_quest_progress(p_user uuid, p_type text, p_amount int)` + `claim_quests` :
   progresse les quêtes actives du jour (jour = Europe/Paris), auto-complete, crédit
   chakra au claim. Les quêtes du jour sont générées à la première action du jour
   (fonction `ensure_daily_quests`).
6. `update_login_streak(p_user uuid)` : appelé à chaque login ; hier → ++, aujourd'hui →
   noop, sinon reset 1 ; J7 → cosmétique streak (streak_reward dans config), sinon chakra
   croissant par jour.
7. `buy_cosmetic / apply_cosmetic / reroll_cosmetic` : achat chakra ('INSUFFICIENT_CHAKRA'),
   application sur une carte possédée ('NOT_OWNER', une seule instance par type par carte),
   reroll (brûle l'instance, crédite un autre cosmétique du même type moyennant chakra,
   seedé par gen_random_uuid pour la randomness serveur).
8. `toggle_wishlist(p_user uuid, p_character_id uuid)` : upsert/delete, cap 10 slots
   ('WISHLIST_FULL'), wishlist_count cohérent.

RÈGLES STRICTES :
- Toute écriture économique passe par les RPC, jamais d'update direct client. RLS
  deny-by-default : profiles/user_cards/user_cosmetics/wishlists/user_quests =
  auth.uid() = user_id ; characters/themes/cosmetics/quests = lecture publique ;
  drops_log = insert via RPC uniquement, aucune lecture utilisateur ; idempotency_keys =
  propriétaire uniquement.
- Les poids et taux restent côté serveur (arguments avec DEFAULT, overridables par
  l'admin plus tard, jamais exposés au client).
- La contrainte unique (character_id, print_number) DOIT exister : elle est le filet
  ultime contre tout bug de concurrence.
- Aucune fonction ne fait de HTTP call. Aucune fonction ne logge de donnée sensible.
- Chaque fonction : commentaire d'intention, gestion d'erreurs par RAISE EXCEPTION avec
  code métier, testée par les tests de concurrence de l'Agent E.

DEFINITION OF DONE : `supabase db reset` sans erreur ; `supabase test` (ou scripts SQL)
prouvant : 2 open_booster simultanés → prints distincts, double appel avec la MÊME
idempotency_key → 1 seul débit, 0 booster/point négatif, pity exacts, daily pack 1/jour,
RLS : user A ne lit rien de user B. CI verte.
```

---

## PROMPT A — AGENT BOOSTER ENGINE

```
Tu es l'agent Backend Game Engine senior de MANGA SOCIETY. L'Agent Architecte a produit
`SPEC.md`, `supabase/schema.sql`, `lib/errors.ts`, `lib/validations/`, `types/api.ts`.
LIS-LES EN PREMIER. Tu ne touches PAS au frontend, PAS au schéma (migration additive
documentée dans `MIGRATIONS.md` si bug bloquant).

MISSION : les route handlers serveur = une couche MINCE et stupide au-dessus des RPC.
Toute la logique vit en SQL (déjà écrit). Ta valeur ajoutée : auth, validation,
idempotence, rate limiting, observabilité, erreurs propres.

PÉRIMÈTRE EXACT :
1. `POST /api/boosters/open` : auth → Zod(OpenBoosterInput) → le CLIENT génère
   idempotency_key (uuid v4) à chaque clic sur "Ouvrir" et l'envoie → RPC
   open_booster → mappe le résultat vers OpenBoosterResponse (types/api.ts). Gestion
   des erreurs : catch Postgres raise → code métier de lib/errors.ts → réponse
   { error: CODE } + status correct (409 'NO_BOOSTER', 422 'INVALID_THEME', …).
   Jamais de stack trace ni de message SQL au client.
2. `POST /api/boosters/open-premium` : idem (dépense 10 points, 'NOT_ENOUGH_POINTS').
3. `POST /api/boosters/daily` : 'ALREADY_CLAIMED' + dans la réponse, next_reset_at =
   minuit Europe/Paris calculé côté serveur.
4. `GET /api/boosters/state` : état read-only post-recharge : booster_count,
   next_recharge_at, premium_points, chakra, pity_legendary_left, pity_mythic_left,
   golden_counter, daily_pack { available, theme_slug }, quest_widget (3 quêtes du jour).
   Solide sous polling 30s et sous 500 rps (pas de N+1, un seul RPC ou une vue SQL).
5. `POST /api/cards/burn` → RPC → réponse { chakra_gained, new_balance }.
6. `GET /api/collection` : paginé (cursor-based, pas d'offset) — filtres theme/rarity/
   search/sort côté SQL. `GET /api/collection/album` : persos manquants groupés par
   anime avec statut possédé. `GET /api/cards/:id` : détail carte + compte de joueurs
   possédant ce perso (count agrégé, indexé).
7. `GET /api/quests`, `POST /api/shop/buy`, `POST /api/cards/:id/apply-cosmetic`,
   `POST /api/cards/:id/reroll-cosmetic`, `POST /api/wishlist/toggle`,
   `GET /api/wishlist`, `GET /api/themes/:slug/pool-info` (nb persos par rareté +
   nombre d'envies de l'user présentes — pour "X de tes envies dans ce booster").
8. Hook login : `update_login_streak` appelé à la création de session (route dédiée,
   idempotente côté SQL de toute façon).
9. **Middleware transversal** : (a) auth Supabase (401) ; (b) rate limit léger par user
   ET par IP (1 open / 2s ; token bucket en mémoire suffit en V1, interface derrière laquelle
   on branchera Upstash plus tard) ; (c) request id (uuid) propagé en header + log
   structuré JSON (method, route, user_id, status, duration_ms, request_id) — un logger,
   pas des console.log.
10. **Intégrité** : `scripts/smoke-engine.ts` (vitest) — 10 users virtuels ouvrent en
    parallèle sur Supabase LOCAL : 0 print dupliqué, 0 compteur négatif, points premium
    exacts, drops_log complet, pity exacts (25 ouvertures → ≥1 L ; 200 → ≥1 M), golden
    exactement tous les 10, daily pack strict 1/jour, MÊME idempotency_key 3× → 1 seul
    débit. Ce script tourne en CI.

CONTRAINTES :
- Route Handlers Next.js, TS strict, Zod, erreurs = { error: CODE_I18N } (le client
  traduit). Pas de logique métier dans les handlers au-delà de auth/validation/transport.
- Pas de `any`, types DB depuis types/database.ts. Service role key uniquement ici.
- Pas de N+1 : tout agrégat en une requête (vues SQL ou RPC).
- Endpoints manquants / contrats incohérents → `HANDOFF.md`, ne contourne jamais.

DEFINITION OF DONE : routes répondent avec tokens de test ; `npm run test` + smoke-engine
verts en CI sur Supabase local.
```

## PROMPT B — AGENT UI CORE

```
Tu es l'agent Frontend Core senior de MANGA SOCIETY. L'Agent Architecte a produit SPEC.md,
types/api.ts, lib/errors.ts. L'Agent Engine construit en parallèle les routes — code
CONTRE types/api.ts (pas l'inverse ; incohérences → HANDOFF.md).

MISSION : toutes les pages et flux utilisateur SAUF la séquence d'ouverture (Agent Juice —
livre la page et `<BoosterOpening cards isGolden onComplete>` avec placeholder propre qui
liste simplement les 5 cartes reçues en attendant).

PÉRIMÈTRE EXACT :
1. **i18n** : next-intl fr/en, messages complets, zéro literal.
2. **Auth** : magic link email + Discord OAuth (Discord = login UNIQUEMENT, aucune mention
   de bot/app Discord dans le produit), /auth/callback, middleware de protection, choix du
   username (citext, vérif dispo en temps réel), appel du hook streak au login.
3. **PWA** : (a) registration du service worker UNIQUEMENT en prod ; (b) **bannière
   d'installation** façon Kyara (barre sous le header : icône + "Installe Manga Society
   sur ton ordi" + bouton Installer) pilotée par beforeinstallprompt, dismissable
   (localStorage 7 jours), CTA iOS dédié (instructions add-to-homescreen, pas d'API) ;
   (c) hook usePWA (isInstalled, canInstall, promptInstall) ; (d) page offline dédiée ;
   (e) icônes/splash selon SPEC.
4. **`/`** : héro dark clean (glassmorphism mesuré), double rareté + print expliqués en
   3 étapes numérotées, CTA login.
5. **`/boosters`** : LA page de jeu. Grille des 6 thèmes (pack_art de l'Agent Juice,
   placeholder propre en attendant). Panneau sélectionné façon Kyara : 5 cartes/booster,
   taille du pool par rareté (barres), **"X de tes envies dans ce booster"**, bouton ouvrir
   (envoie une NOUVELLE idempotency_key à chaque clic — générée dans le handler du clic),
   stock + barre de recharge temps réel (React Query polling 30s state + décompte smooth
   client). Widgets : pity ("Légendaire garantie dans X", "Mythique dans Y"), compteur
   doré "X/10", pack du jour (grisé + countdown minuit Europe/Paris affiché), quêtes
   (3 + progression), streak J1/7.
6. **`/collection`** : onglets Grille / **Album** (silhouettes numérotées groupées par
   anime, barre de complétion par anime). Filtres : thème, 6 pills rareté, recherche
   (debounce 300ms), tri. Fiche carte au clic : face (nom, anime, rareté, **print #N /
   print_count existants**, badge first owner, cosmétiques) + verso (date d'obtention,
   nb de joueurs possédant le perso) ; Burn (confirm modal + preview chakra),
   appliquer cosmétique, wishlist toggle. Virtualisée > 500 cartes.
7. **`/u/[username]`** : profil public (stats, % collection, plus bas print, plus haute
   rareté, streak, vitrine 5 cartes favorites, wishlist publique).
8. **`/shop`** : onglets Frames/Holos/Dyes, prix chakra, aperçu live sur une carte de sa
   collection.
9. **Qualité transverse** : React Query (staleTime 30s, invalidation par mutation),
   skeletons, error boundaries par section (une section cassée ≠ page blanche), toasts
   sonner, états vides élégants, focus management + aria sur les interactions clavier
   (la séquence d'ouverture est au clavier), `<Image>` partout avec remotePatterns.

CONTRAINTES :
- TS strict, Tailwind + shadcn/ui, thème "Kyara clean" (dark, sobre, premium — pas de
  déluge de néon). Mobile-first. Budget first-load JS < 200KB gzip.
- AUCUNE logique d'économie client : affichage + appels API uniquement (les pity, compte
  de recharge etc. affichés viennent DU SERVEUR ; le décompte smooth est cosmétique et se
  resync).
- Optimistic UI INTERDIT sur toute action économique (burn, achat, ouverture) : état
  pending + résolution serveur.

DEFINITION OF DONE : parcours complet manuel — login → ouvrir booster → (placeholder) →
collection → burn → chakra → achat frame → frame visible → album silhouettes → bannière
PWA installable sur mobile et desktop.
```

---

## PROMPT C — AGENT DATA PIPELINE

```
Tu es l'agent Data Pipeline senior de MANGA SOCIETY. LIS SPEC.md et supabase/schema.sql.
Tu ne touches PAS au frontend ni aux routes API.

MISSION : la table `characters` remplie avec un maximum de persos de qualité (images,
rareté de base, thèmes) via AniList et Jikan — résilient, idempotent, reprenable après
crash. Un pipeline de production, pas un script jetable : 5 000 persos bien importés =
des mois de contenu.

SOURCES (par ordre de priorité) :
1. **AniList GraphQL** (https://graphql.anilist.co) — SANS clé. Champs : Character.id,
   name.full, name.native, image.large, description, favourites, media.nodes (title.romaji,
   genres, format, countryOfOrigin, isAdult). Rate limit dégradé à 30 req/min.
2. **Jikan v4** (https://api.jikan.moe/v4) — SANS clé, ~60 req/min, ~3 req/s.
   - démographie explicite (Shounen/Shoujo/Seinen/Josei) → thèmes shonen/shojo/seinen.
   - fallback image si AniList down ou image manquante.
3. Webtoon : AniList n'a pas de flag propre. Règle : format MANGA/MANHWA/NOVEL ET
   countryOfOrigin = "KR" → thème webtoon. Liste de renfort manuelle (Solo Leveling,
   Tower of God, The God of High School, Omniscient Reader…) en seed.
4. Big 3 : LISTE CURATÉE (One Piece, Naruto/Boruto, Bleach) — matching sur title.romaji,
   rapporté pour vérif humaine.
5. **Filtrage qualité** : exclure les media isAdult = true ; exclure les persos sans image
   AniList ET sans fallback Jikan ; exclure les noms vides. Tout exclu est logué dans le
   rapport (on veut savoir ce qu'on a perdu et pourquoi).

CLASSIFICATION THÈMES (tags dans characters.themes[]) :
- shonen : démo Shounen (Jikan) OU genres Action/Adventure
- shojo  : démo Shoujo
- seinen : démo Seinen
- isekai : genre "Isekai" OU mot-clé titre/synopsis (logique simple, rapportée)
- webtoon : règle KR
- big3   : liste curatée
Un perso peut avoir PLUSIEURS thèmes (un perso Big 3 est aussi shonen). Toute la logique
de classification vit dans `pipeline/classify.ts`, pure et unit-testée (table de cas).

RARETÉ DE BASE — 6 tiers, percentiles de `favourites` AniList sur le pool final :
top 1% = mythic · 1→5% = legendary · 5→20% = epic · 20→45% = rare · 45→75% = uncommon ·
reste = common. `rarity_overridden = false` (doc d'override dans README).

RÉSILENCE (le cœur de ton travail) :
- Rate limiter local respectant 30 req/min AniList / 3 req/s Jikan, avec file d'attente.
- Retries avec exponential backoff + jitter sur 5xx et 429 ; circuit breaker (3 échecs →
  pause 60s → si persistance, checkpoint propre et exit code explicite).
- Checkpoint `pipeline/checkpoint.json` (dernier curseur par source) → --resume sans
  doublon (upsert sur anilist_id, clé unique déjà en base).
- Mode --dry-run (parse + classify + rapport, zéro écriture) et --limit pour les tests.
- Journal structuré : par batch, nb fetched/inserted/updated/skipped/excluded + raisons.

LIVRABLES :
1. `pipeline/` : ingest.ts (orchestrateur), anilist.ts, jikan.ts, classify.ts, db.ts,
   ratelimit.ts, checkpoint.ts, report.ts. Tests unitaires sur classify + ratelimit.
2. `pipeline/verify.ts` : 0 doublon anilist_id ; image_url renseigné ; ≥1 thème par
   perso ; distribution des 6 raretés conforme ±2 pts ; ≥300 par thème ; rapport final
   `pipeline/report.md` (par thème, par rareté, top 20 mythic, exclusions listées).
3. Seed réel : **≥ 3000 personnages**, équilibrés sur les 6 thèmes.
4. `pipeline/README.md` : relancer, --resume, ajouter un anime (--anime="Jujutsu
   Kaisen"), ajouter un thème, corriger un mauvais tag.

CONTRAINTES :
- Jamais d'appel API en prod runtime : tu remplis la BDD une fois, le jeu lit SA base.
- Rate limits respectés scrupuleusement (ban possible). Pas de scraping (Cloudflare etc.).
- Images : URL AniList (hotlink OK au lancement) + image_url_fallback Jikan.

DEFINITION OF DONE : `npx tsx pipeline/ingest.ts --limit 50 --dry-run` propre ;
`npx tsx pipeline/ingest.ts --resume` idempotent (2e run = 0 inserted, 0 erreur) ;
verify.ts passe ; ≥ 3000 persos en base.
```

## PROMPT D — AGENT JUICE (LA SÉQUENCE D'OUVERTURE = TA RAISON D'ÊTRE)

```
Tu es l'agent Juice & Polish senior de MANGA SOCIETY. LIS SPEC.md. L'Agent UI Core a
livré les pages ; ton périmètre est UNIQUE mais c'est LA raison pour laquelle les gens
reviennent : la séquence d'ouverture (référence : kyara.games) et le rendu premium des
cartes. Exigence : 60fps sur mobile 4G, zéro jank.

FLOW DE RÉFÉRENCE (reproduis, dans notre DA) :
1. Écran pack : booster physique centré (pack art par thème), "Glisse le doigt le long
   du haut pour déchirer", compteur ×N, pity visible en bas.
2. Déchirure : pointer-drag le long du bord supérieur → le haut se détache (mask/clip
   path animé), confettis dorés (canvas maison, particules en transform/opacity uniquement),
   halo lumineux qui s'échappe, son de déchirure.
3. 5 cartes face cachée empilées (offset léger, verso), pastilles de progression (5),
   "Tout révéler", clavier : Espace = suivante, maintenir = avance rapide, Échap = skip.
4. Reveal un par un : flip 3D (transform-style preserve-3d), badge "Nouveau" si nouveau
   perso, intensité par rareté : C flip sobre · U brillance · R confettis · E particules
   dorées + glow · L flash + pulse + titre animé · M = animation la plus forte du jeu
   (shake, rayons, particules persistantes). Tier print : badge #1-10 doré scintillant,
   #11-100 argent. Print #N lisible.
5. Récap : 5 cartes en éventail, "Meilleure carte" mise en avant, boutons Ouvrir un autre
   / Changer de booster / Voir la collection / Copier le lien / **Image** (PNG partageable
   du pull — satori + resvg ou html-to-image, format paysage, og-ready).
6. Skip total à tout moment, séquence rejouable depuis l'historique. 20-30s pour 5
   cartes sans skip. prefers-reduced-motion : reveal instantané sobre.

COMPOSANT CARTE DÉFINITIF — `/components/game-card/` :
- Ratio carte TCG. Structure : image perso + CADRE DE BASE par rareté (6 déclinaisons
  C/U/R/E/L/M, sobre, codes TCG) + badge print + badge first owner + overlays cosmétiques
  (frame = cadre par-dessus ; holo = irisé animé au survol, subtil au repos ; dye = teinte
  blend-mode). TOUT piloté par `css_config` jsonb (un cosmétique = des tokens CSS, pas du
  code par cosmétique). Variantes grille/fiche/showcase. Fallback image cassée →
  silhouette + initiale.
- Le rendu d'une carte existe UNIQUEMENT ici : refactorise tout rendu carte de l'Agent B
  vers ce composant (note dans HANDOFF.md).
- Micro-polish : tilt 3D au hover (desktop, pointer: fine), transitions de route,
  skeletons cohérents, favicon + og-image, shimmer sobre sur les boutons premium.

PERFORMANCE (non négociable) :
- Animations UNIQUEMENT transform/opacity ; will-change parcimonieux ; aucun reflow en
  boucle ; particules < 300 nœuds DOM (canvas) ; sons < 200KB chacun, préchargés
  intelligemment (preload des 2-3 premiers uniquement) ; verso préchargé dès l'écran pack.
- L'écran d'ouverture ne dépend d'aucun fetch : il reçoit ses données en props au clic.

ASSETS À PRODUIRE (IA ; si tu ne peux pas générer, livre les prompts finaux dans
`assets/prompts.md` avec les specs exactes : ratio, fond, style) :
- `public/packs/{theme}.png` ×6 : booster TCG premium, médaillon central avec kanji du
  thème (混 shonen-mix, 少 shonen, 花 shojo, 異 isekai, 青 seinen, 球 sport — webtoon :
  motif manhwa ou hanja), texture foil/papier, coins arrondis, fond sombre uni, ratio 3:4.
  Prompt type : "premium anime trading card booster pack, gold foil texture, japanese
  kanji medallion, dark elegant background, studio product shot, no text besides kanji, 3:4".
- `public/card-back.png` : verso carte — seigaiha sombre + médaillon doré, ratio 2.5:3.5.
- `public/sounds/` CC0 : tear, flip, rare, epic, legendary, mythic, coin, click (.mp3 < 200KB).

CONTRAINTES : framer-motion OK ; aucune lib de particles lourde ; bundle minimal ;
mobile d'abert ; assets 100 % locaux.

DEFINITION OF DONE : ouvrir un booster est un plaisir ET un plancher technique propre —
mesure avec les DevTools (Performance, 4G throttling, CPU 4x) : frame drops < 5% pendant
la séquence. Si c'est cheap ou ça rame, ce n'est pas fini.
```

## PROMPT E — AGENT QA & ÉCONOMIE

```
Tu es l'agent QA & Économie senior de MANGA SOCIETY. Tu arrives en dernier. LIS SPEC.md,
lib/config.ts, puis tous les HANDOFF.md.

MISSION : le jeu ne doit ni planter, ni être trichable, ni s'auto-détruire économiquement.
Tu livres des preuves exécutables, pas des impressions.

1. **Tests de concurrence (P0 absolu)** — vitest sur Supabase LOCAL :
   - test-prints : 10 users ouvrent en parallèle (Promise.all) → 0 doublon
     (character_id, print_number), 0 booster_count négatif, 0 carte orpheline.
   - burn pendant ouverture simultanée → aucune corruption.
   - double-clic + retry : MÊME idempotency_key ×3 → 1 seul débit ; keys différentes en
     rafale → rate limit propre (429 'RATE_LIMITED').
2. **Tests métier** :
   - Pity : 25 ouvertures → ≥1 L ; 200 → ≥1 M ; reset correct ; daily et premium comptent.
   - Doré : exactement tous les 10, taux ×2 appliqués, reset compteur.
   - Daily pack : 1/jour strict (minuit Europe/Paris), Épique min, gratuit, compte pity.
   - Streak : J1→J7, croissance, reset sur trou, pas de double claim.
   - Points premium : +1 exact par tranche de 100, jamais de double.
3. **Property-based RNG** (fast-check) : 100 000 rolls → distribution des 6 raretés dans
   ±0.3 pt des poids de config ; tirage perso uniforme dans chaque tier (chi² basique).
4. **RLS audit** : 2 users de test prouvent pour CHAQUE table : A ne lit/modifie rien de
   B (sauf tables publiques) ; drops_log insert-only ; idempotency_keys propriétaires.
5. **Simulation économique** — `scripts/sim-economy.ts` : 50 joueurs × 30 jours (10
   boosters/j + daily + quêtes + streak, burn ~40% doublons) → `report-economy.md` :
   - inflation chakra (stock moyen/joueur, tendance) — tout ajustement proposé dans
     ECONOMY_PATCH.md avec avant/après chiffré ; TU NE DÉCIDES RIEN.
   - jours pour compléter un album de thème ; jours pour un booster premium F2P ;
     pression wishlist sur la burn value.
6. **Vérifications produit** : routes privées non protégées, literals non traduits (scan),
   boutons sans pending state, CSP/security headers de base (X-Frame-Options, etc. via
   next.config), liens morts.
7. **Performance** : Lighthouse CI mobile sur / et /collection (perf ≥ 80, LCP < 2.5s
   4G) ; budget first-load JS < 200KB gzip vérifié au build ; séquence d'ouverture
   mesurée sous throttling 4x CPU : frame drops < 5%.

CONTRAINTES : tu ne réécris pas les features, tu trouves les trous. Failles →
QA_REPORT.md classées P0 (corruption/triche) / P1 (économie) / P2 (cosmétique).

DEFINITION OF DONE : QA_REPORT.md sans P0/P1 ouverts ; RNG property tests verts ;
RLS audit complet ; sim-economy exécutée ; CI verte de bout en bout.
```

---

## ORDRE D'EXÉCUTION & CONSEILS

1. **Prompt 0 seul.** Vérifie toi-même avant de lancer la suite : contrainte unique
   (character_id, print_number), idempotency_keys en place, RLS deny-by-default, CI
   fonctionnelle sur un commit trivial.
2. **A + B + C en parallèle** (3 sessions Kimi Code distinctes). A et B se contractent via
   `types/api.ts` ; tout écart → HANDOFF.md. C est indépendant.
3. **D + E en parallèle.** D démarre dès que le placeholder de B existe ; E attend A stable.
4. Anti-patterns à surveiller en review : logique d'économie côté client (P0), print non
   atomique (P0), pity/idempotence contournées (P0), `any` (refus de review), literals
   (P2), déluge de néon (design), optimistic UI sur l'économie (P1).
5. Quand un agent dit "fait", exécute SON Definition of Done toi-même — c'est le seul
   moment où tu touches au code.

**Réglages rapides d'équilibrage** (tous dans `lib/config.ts`, jamais ailleurs) : poids des
6 raretés au roll (C55/U25/R12/E5/L2.4/M0.6), pity (25/200), cadence doré (10), recharge
(+1/6min, cap 10), roll premium (85/15), burn table (5/8/15/30/80/200), seuils visuels de
print (#1 / 2-10 / 11-100 / 101-500).
