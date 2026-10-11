# HANDOFF — Agent Architecte (PROMPT 0, livrable n°1)

> Main de l'agent architecte. Les agents suivants (A Engine, B UI, C Pipeline, D Juice,
> E QA) DOIVENT lire ce fichier + `SPEC.md` avant de coder. Chaque agent complète ensuite
> sa propre section ci-dessous (ou un fichier dédié) à la fin de son travail.

## 1. Ce qui est produit (cette passe)

| Fichier | Contenu |
|---|---|
| `SPEC.md` | Architecture détaillée : arborescence complète (`app/`, `components/`, `lib/`, `types/`, `supabase/`, `pipeline/`, `scripts/`, `messages/`, `assets/`, `public/`), toutes les routes App Router, cartographie agent → fichiers avec règles de frontière disjointes, 5 flux métier séquencés (open booster idempotent, burn, daily pack, login streak, quêtes), politique service worker, sécurité/headers, conventions git/CI, anti-patterns review |
| `docs/adr/0001-pourquoi-supabase.md` | Pourquoi Supabase (Postgres managé + Auth + RLS + RPC SECURITY DEFINER) plutôt qu'API maison + ORM ou Firebase |
| `docs/adr/0002-idempotence-cote-sql.md` | Pourquoi l'idempotence vit dans la RPC (table `idempotency_keys` + `ON CONFLICT DO NOTHING` dans la transaction) plutôt qu'en middleware applicatif : zéro fenêtre de course, atomicité avec le débit, protection double-clic/retry/refresh |
| `docs/adr/0003-pwa-plutot-qu-app-native.md` | Pourquoi PWA installable plutôt qu'app native ou bot Discord. Rappel verrouillé : Discord n'est QU'une méthode de login OAuth |
| `HANDOFF.md` (ce fichier) | Main de l'architecte |

Aucun autre fichier du repo n'a été touché. Aucune dépendance installée. Aucun code écrit.

## 2. Décisions prises à connaître

1. **Périmètre de cette passe** : conformément à l'instruction reçue, seuls les 5 fichiers
   de documentation ci-dessus ont été livrés. Les autres livrables du PROMPT 0 originel
   (voir §3) restent à produire avant ou en parallèle du lancement des agents A/B/C.
2. **Frontières d'ownership figées** dans `SPEC.md` §4 : `components/game-card/`,
   `components/booster-opening/`, `components/effects/` = Agent D seul ; `app/api/**` +
   `lib/server/**` = Agent A seul ; `pipeline/**` = Agent C seul ; pages/i18n/PWA = B ;
   tests + sim économique = E. Tout écart → entrée dans ce HANDOFF + PR séparée.
3. **`types/api.ts` = contrat A↔B**, initial par l'Agent 0, évolutions portées par A.
4. **Idempotence** : clé uuid v4 régénérée à CHAQUE clic côté client ; la RPC insère
   `ON CONFLICT (key) DO NOTHING` et early-return le résultat stocké — motif obligatoire
   pour toute RPC économique (ADR 0002).
5. **Prints atomiques** : `UPDATE characters SET print_count = print_count + 1 ... RETURNING`
   + contrainte `unique(character_id, print_number)` = filet ultime.
6. **Middleware** : `middleware.ts` appartient à B (routing next-intl + refresh session) ;
   la garde auth des routes API se fait par `requireUser()` côté handler (A), pas en
   middleware — décision prise pour éviter un conflit d'écriture A/B sur ce fichier.
7. **Service worker** : recommandation `@serwist/next` documentée dans `SPEC.md` §6
   (precache shell, StaleWhileRevalidate images AniList avec expiration 200 entrées,
   skipWaiting + clientsClaim, registration prod uniquement, page `/offline`).
8. **Temps réel** : pas de Realtime en V1 — polling `GET /api/boosters/state` 30 s.
9. **Schéma BDD** : 12 tables verrouillées (liste exacte dans `SPEC.md` §2.5), poids/taux
   côté serveur en arguments SQL à DEFAULT, jamais exposés au client.

## 3. Ce qui reste à produire (avant / pendant le lancement des agents)

Ces livrables figurent dans le PROMPT 0 originel mais ne relèvent pas de la passe
documentation confiée ici. Leur absence est connue et bloquante pour le démarrage de
A/B/C — à produire par l'orchestrateur ou un agent de complément, dans l'ordre :

1. `lib/config.ts` — TOUTES les constantes d'équilibrage typées et commentées (poids
   C55/U25/R12/E5/L2.4/M0.6, pity 25/200, doré 10, recharge +1/6 min cap 10, burn table
   5/8/15/30/80/200, multiplicateur wishlist `1 + min(n/1000, 2)`, roll premium 85/15,
   seuils visuels print #1 / 2-10 / 11-100 / 101-500, cap wishlist 10, cadence quêtes).
2. `lib/errors.ts` — enum union des codes métier ('NO_BOOSTER', 'INVALID_THEME',
   'NOT_ENOUGH_POINTS', 'ALREADY_CLAIMED', 'WISHLIST_FULL', 'RATE_LIMITED', 'NOT_OWNER',
   'INSUFFICIENT_CHAKRA', …).
3. `lib/validations/` — schémas Zod partagés (OpenBoosterInput, BurnInput,
   WishlistToggleInput, BuyCosmeticInput, ApplyCosmeticInput, RerollCosmeticInput).
4. `supabase/migrations/0000_schema.sql` — schéma complet des 12 tables + contraintes + index
   (collection : user_id+obtained_at, character_id+base_rarity, themes GIN,
   lower(name_romaji) trigram) + RLS deny-by-default sur TOUTES les tables.
5. `supabase/migrations/0001_functions.sql` — les 11+ RPC SECURITY DEFINER idempotentes
   (open_booster, open_premium_booster, claim_daily_pack, burn_card,
   update_quest_progress, claim_quests, ensure_daily_quests, update_login_streak,
   buy_cosmetic, apply_cosmetic, reroll_cosmetic, toggle_wishlist) + `pgcrypto`.
6. `supabase/migrations/0002_seed.sql` — 6 thèmes, ~15 cosmétiques, pool de quêtes.
7. `types/database.ts` (types générés) + `types/api.ts` (contrats de réponse de chaque
   route : OpenBoosterResponse, BoosterStateResponse, BurnResponse, CollectionPage,
   AlbumResponse, QuestDto…).
8. `scripts/dev-seed.ts` — 2 users de test + cartes (dev local uniquement).
9. `.env.example` — Supabase URL/anon/service role, Discord OAuth client id/secret,
   NEXT_PUBLIC_SITE_URL.
10. `public/manifest.webmanifest` + icônes 192/512/maskable (placeholder accepté).
11. `.github/workflows/ci.yml` — lint → typecheck → build → `supabase start` →
    migrations → seed → tests.

**Definition of Done de l'architecture complète** (à vérifier avant de lancer A/B/C) :
`supabase db reset` sans erreur ; contrainte `unique(character_id, print_number)` présente ;
table `idempotency_keys` présente ; RLS deny-by-default sur les 12 tables ; CI verte sur un
commit trivial.

## 4. Points de vigilance pour les agents suivants

- **A** : route handlers minces (auth → Zod → rate limit → RPC → mapping erreur). Jamais de
  logique métier. `{ error: CODE_METIER }` + status (409 NO_BOOSTER, 422 INVALID_THEME,
  429 RATE_LIMITED, …). Jamais de stack trace ni message SQL au client.
- **B** : zéro logique d'économie client, zéro literal UI, optimistic UI interdit sur
  l'économie, `<BoosterOpening cards isGolden onComplete>` monté avec placeholder propre
  en attendant D, tous les rendus carte refactorés vers `components/game-card/` (PR à
  reviewer quand D livre).
- **C** : upsert idempotent sur `anilist_id`, rate limits AniList 30 req/min et Jikan
  3 req/s respectés scrupuleusement, checkpoint + `--resume`, `--dry-run`, aucun appel API
  en runtime prod.
- **D** : 60 fps mobile 4G, animations transform/opacity uniquement, particules < 300 nœuds
  canvas, sons < 200 KB, séquence au clavier, `prefers-reduced-motion` sobre.
- **E** : tests sur Supabase LOCAL uniquement ; property-based RNG (fast-check) ; RLS audit
  pour chaque table ; simulation économique 50 joueurs × 30 jours ; `QA_REPORT.md` classé
  P0/P1/P2. E ne réécrit pas les features.

## 5. Dettes / sujets laissés ouverts

- **Base cloud appliquée** : les migrations ordonnées (`supabase/migrations/0000_schema.sql`,
  `0001_functions.sql`, `0002_seed.sql`) sont poussées sur le projet cloud
  (ref `pshtqndklfbtrjhprrua`) via `supabase db push`. Vérifié : 6 thèmes, 16 cosmétiques,
  7 quêtes, RPC présentes, 0 personnage (import = Agent C). Les agents A/B/C peuvent coder
  contre ce projet ; leurs clés vont dans `.env.local` (voir `.env.example`).

- Choix final manifest : `public/manifest.webmanifest` (statique) vs `app/manifest.ts`
  (généré) — les deux sont listés dans `SPEC.md` §2.1 ; trancher lors de la production du
  fichier (recommandation : `.webmanifest` statique, plus simple à précacher).
- Nettoyage périodique de `idempotency_keys` (> 24 h) : pas implémenté en V1, à prévoir.
- Upstash pour le rate limiting distribué : l'interface est spécifiée (`lib/server/ratelimit.ts`),
  l'implémentation V1 reste un token bucket mémoire.
- Notifications push et Realtime : explicitement exclu du MVP (cf. prompt, V2).

---

# HANDOFF — Agent C (Data Pipeline)

## Livré (périmètre `pipeline/**` uniquement)

- **`pipeline/ingest.ts`** — orchestrateur CLI (`--dry-run`, `--resume`, `--limit`, `--anime`).
  Parcours global AniList par `favourites` desc (repli alphabétique a→z si vide), filtrage
  qualité (adulte/sans image/sans nom → exclus **logués**), fallback image Jikan,
  classification, raretés par percentiles, upsert idempotent ou rapport sec en dry-run.
  Checkpoint après chaque page traitée → `--resume` sans doublon (upsert `anilist_id`).
- **`pipeline/anilist.ts` / `jikan.ts`** — clients sans clé, rate limiter 2,1 s (30 req/min)
  et 350 ms (~3 req/s), retries 429/5xx backoff+jitter, circuit breaker (3 échecs → 60 s,
  checkpoint propre + exit 1).
- **`pipeline/classify.ts`** — classification PURE testée : shonen (Action/Adventure ou démo
  Jikan), shojo (Shoujo, Josei→shojo), seinen, isekai (genre OU titre "Isekai" OU synopsis
  **strict** transport+another world), webtoon (MANGA/MANHWA/NOVEL + KR), big3 (One Piece,
  Naruto/Boruto, Bleach). Raretés : `RARITY_THRESHOLDS` (1/5/20/45/75 %), `assignRarities`.
- **`pipeline/db.ts`** — upserts idempotents UNIQUEMENT (jamais de DDL). Préserve
  `rarity_overridden` et ne touche JAMAIS `print_count`/`wishlist_count`. `recalculateRarities`
  : recalcul global des raretés sur tout le pool en fin de run live.
- **`pipeline/verify.ts`** — invariants du pool (0 doublon, images, ≥1 thème, distribution
  ±2 pts, ≥300/thème), exit 1 si échec. `pipeline/report.ts` + `report.md` (par rareté,
  par thème, top 20 mythic, exclusions **et rescues Jikan** listés).
- **Tests vitest** : `classify.test.ts` (20 cas) + `ratelimit.test.ts` (8) — 28/28 verts.

## Décisions post-dry-run (validées par l'orchestrateur)

1. **Faux positifs isekai corrigés** : la regex synopsis matchait toute mention de
   "another world" (Light Yagami, Marin Kitagawa flaggés isekai). Nouvelle règle : synopsis
   exige transport/réincarnation/summon ET "another world". 6 → 3 isekai sur l'échantillon.
2. **Rescue Jikan ciblée** (décision orchestrateur) : shojo/seinen ne sont pas détectables
   via AniList seul. Pour chaque perso exclu `no_theme` OU accepté sans shojo ni seinen,
   1 appel Jikan `/anime?q=<titre>` résout la démographie (Shounen/Shoujo/Seinen/Josei).
   Matching fuzzy → **chaque rescue est listé dans report.md pour vérif humaine**.
3. **Dominance shonen acceptée** (décision orchestrateur) : règle Action/Adventure maintenue
   telle quelle (48/50 sur le dry-run — attendu, le parcours profond diversifiera).
4. **Listes curatées V1** (changement de priorité orchestrateur, "V1, ne pas s'acharner") :
   `SHOJO_TITLE_PATTERNS` / `SEINEN_TITLE_PATTERNS` (~30 titres célèbres chacune) +
   `SHONEN_TITLE_PATTERNS` complémentaire (titres WSJ sans genre Action/Adventure : Death
   Note, Haikyuu…) — matching titre.romaji, "ce qui passe passe". Réintègrent les exclus
   du 1er dry-run (Chika←Kaguya-sama seinen, Kurisu←Steins;Gate seinen, L←Death Note,
   Violet←shojo). Les untagged restants restent exclus et sont listés dans le rapport.
5. **Bug API AniList contourné** : nester `media` dans `Media.characters.nodes` renvoie
   HTTP 500 (bug serveur vérifié par requêtes curl) — `--anime` récupère d'abord les IDs
   puis enrichit via `Character(id:)` (1 requête/perso supplémentaire).

## ⚠️ Point de vigilance : Jikan injoignable depuis ce poste

`api.jikan.moe` timeout au niveau réseau (connect échoue, pas un 429). Conséquences :
- **Rescues démographiques non validés end-to-end** — le code dégrade proprement
  (null, jamais bloquant), mais la résolution shojo/seinen réelle reste à prouver depuis un
  réseau où Jikan est accessible. Vérifier la section "Résolutions Jikan" du rapport
  après le 1er run live.
- **Fallback image Jikan** idem (peu critique : ~100 % des persos AniList ont une image).

## Reste à faire (côté C)

1. **Seed live ≥ 3000 persos** : `npx tsx pipeline/ingest.ts` puis `--resume` jusqu'à
   couverture, EN ATTENDANT LE GO orchestrateur (dry-run montré, pas encore seedé).
2. `npx tsx pipeline/verify.ts` après seed (seuil ≥300/thème, distribution ±2 pts).
3. Vérifier les rescues Jikan dans `report.md` (réseau dépendant).
4. Renfort manuel webtoons curatés si besoin : `--anime="Solo Leveling"`, etc.

## À câbler à l'intégration

- **Booster MIX "Tous les persos"** (décision V1) : `open_booster` doit accepter
  `theme_slug = 'mix'` = aucun filtre thème (pool complet). UI = 7e tuile.
  `supabase/migrations/0002_seed.sql` doit ajouter le thème `mix` (name_fr "Tous les
  persos", sort_order après les 6 existants). Touche : Agent A (RPC + route),
  Agent 0 (seed), Agent B (tuile). Le pipeline n'a rien à changer : un perso
  sans thème répond au mix, pas aux 6 thèmes filtrés.

## État du dry-run `--limit 50`

50 acceptés / 16 exclus (`no_theme`), thèmes : shonen 48, big3 7, isekai 3, webtoon 1,
shojo 0, seinen 0 (règles verrouillées — voir rescues). Rapport : `pipeline/report.md`.

---
*Prochaine étape : produire les livrables §3 (ou confirmer qu'ils sont produits en parallèle),
puis lancer A + B + C en parallèle selon `SPEC.md` §10.*


---

# HANDOFF — Agent A (PROMPT A, Booster Engine)

## Livré (périmètre `app/api/**` + `lib/server/**` + `scripts/smoke-engine*`)

| Fichier | Contenu |
|---|---|
| `lib/server/supabase.ts` | Clients serveur : `getUserClient()` (@supabase/ssr, cookies, refresh session) et `getServiceClient()` (service role, scripts uniquement) |
| `lib/server/auth.ts` | `requireUser()` → 401 `UNAUTHENTICATED` (garde côté handler, jamais dans middleware — SPEC règle 7) |
| `lib/server/ratelimit.ts` | Token bucket mémoire par user ET par IP, interface `RateLimiter` swappable (Upstash plus tard via `setRateLimiter`). Policies : `open` 1/2 s, `mutation` 5/s, `read` 30/s (limites = infra, pas dans lib/config.ts) |
| `lib/server/logger.ts` | Logger JSON structuré (level, time, method, route, user_id, status, duration_ms, error_code) ; `request_id` uuid repris du header entrant ou généré, propagé en réponse (`x-request-id`) |
| `lib/server/api-helpers.ts` | Wrapper transversal `handleApi` : request_id → auth → rate limit → Zod → run() → mapping erreur Postgres → `{ error: CODE }` + status. Aucun message/stack/SQL au client |
| `lib/server/dto.ts` | Mapping RPC → contrats (zod strict, 500 `INTERNAL_ERROR` hors contrat) ; `is_new_character` calculé serveur (borne horodatée avant RPC + garde 3 s de dérive) ; hydratation en 3 requêtes indexées (pas de N+1) |
| `app/api/**` (17 routes) | boosters open / open-premium / daily / state, cards burn + `[id]` + apply-cosmetic + reroll-cosmetic, collection + album, quests GET + **quests/claim**, shop/buy, wishlist GET + toggle, themes/[slug]/pool-info, **me/login-streak** |
| `scripts/smoke-engine.test.ts` | 8 scénarios vitest sur Supabase LOCAL : 10 users parallèles (0 print dupliqué, compteurs bornés, drops_log complet), idempotence ×3 → 1 débit, pity L (25) et M (200) avec poids forcés, doré exactement tous les 10, daily strict 1/jour + Épique min + gratuit, premium 10 pts + slot garanti L/M, burn ownership + crédit + idempotence |
| `vitest.config.ts` | Alias `@`, timeouts 120 s |
| `MIGRATIONS.md` | Journal de la migration additive 0003 |
| `supabase/migrations/0003_read_rpcs.sql` | **Migration additive (SPEC §4 règle 5)** — 8 RPC de lecture `SECURITY DEFINER` : get_booster_state, get_collection_page (curseur, filtres/tris SQL), get_album, get_card_detail (+ owners_count), get_daily_quests, get_wishlist, get_theme_pool_info, get_next_reset_at. Motif : 0001 n'expose que des mutations ; sans ces RPC les GET violent « aucun N+1 / pas de logique métier dans les handlers » (détail dans MIGRATIONS.md). **À appliquer : `supabase db reset` (local) / `supabase db push` (cloud) — non appliquée ici (pas de Docker sur le poste). À faire valider par Agent 0 en review.** |
| `package.json` | `@supabase/ssr` + `@supabase/supabase-js` déplacé en `dependencies` (utilisé au runtime par les handlers), `vitest` en devDeps, scripts `typecheck` et `test` ajoutés |

## Évolutions de contrat `types/api.ts` (Agent A, droit porté — B code contre ce fichier)

1. **`OpenPremiumBoosterResponse`** : `card: OpenedCardDto` → **`cards: OpenedCardDto[]`** — la RPC `open_premium_booster` roll 5 cartes (4 poids complets + slot garanti L/M, cf. commentaire d'intention 0001). `booster_count`/`cards_obtained_count` retirés (RPC ne les renvoie pas — resync via GET state) ; `theme_slug` ajouté.
2. **`ClaimDailyPackResponse`** : resserré sur la réalité RPC (`cards, theme, next_reset_at, pity_×2, golden_counter`). Soldes retirés — resync via GET state.
3. **`LoginStreakResponse` ajouté** (route `POST /api/me/login-streak` listée en SPEC §3 mais absente du fichier initial).

## Demandes aux autres agents (ne pas contourner)

- **Agent 0 — `lib/errors.ts`** (lecture seule pour A) : codes RPC manquants → mapping conservateur en attendant. `IDEMPOTENCY_IN_PROGRESS` → 429 `RATE_LIMITED` (retry, sémantique exacte) ; `QUEST_NOT_COMPLETED`, `NO_COSMETIC_TO_REROLL`, `PROFILE_NOT_FOUND`, `EMPTY_POOL`, `EMPTY_CLAIM`, `INVALID_WEIGHTS` → 500 `INTERNAL_ERROR` + log serveur. **Recommandé : ajouter `QUEST_NOT_COMPLETED` (409), `NO_COSMETIC_TO_REROLL` (409), `IDEMPOTENCY_IN_PROGRESS` (409) à l'enum.** Écart aussi : SPEC §5.1 étape 5 dit « Zod → 422 » mais `ERROR_HTTP_STATUS` fixe `VALIDATION_ERROR` à 400 — A suit lib/errors.ts (400).
- **Agent 0 — `lib/validations/`** : schéma `collectionQuerySchema` (cursor/limit/theme/rarity/search/sort) actuellement inline dans `app/api/collection/route.ts` — à partager avec B (query string identique côté client).
- **Agent 0 — grants service_role** : sur le projet cloud, le service_role n'a AUCUN grant table (constaté : `permission denied for table themes` avec hint GRANT) — les fixtures/scripts (dev-seed, smoke-engine) supposent les droits du setup local Supabase. À vérifier sur `supabase start` ; sinon ajouter les grants fixture (`characters` upsert, `profiles`/`drops_log` lecture) à 0000 ou une RPC de fixture.
- **Agent B** : code contre les contrats évolués ci-dessus. `types/database.ts` section `Functions` étendue avec les 8 RPC 0003 (reflète le schéma additif — à régénérer par `supabase gen types` côté 0 pour vérification).

## Vérifications effectuées / limites

- `npx tsc --noEmit` : **zéro erreur sur tout le périmètre A** (app/api, lib/server, types, scripts). Le typecheck global reste bloqué par un fichier **Agent B** : `components/legal/legal-page.tsx` contient `.../(legal)/*/page.tsx` dans une JSDoc → la séquence `*/` ferme le commentaire (erreur TS1003/TS1161) — à corriger côté B (hors périmètre A).
- `npx eslint` sur le périmètre A : 0 erreur, 0 warning.
- `npm run test` (vitest) : 8 scénarios smoke **SKIPpés volontairement** — `.env.local` pointe vers le **projet cloud** (`pshtqndklfbtrjhprrua.supabase.co`) et le smoke-engine est verrouillé **local-only** (SPEC §8 ; override explicite `SMOKE_ENGINE_ALLOW_REMOTE=1` pour staging jetable). Tests unitaires C (28) verts. **À exécuter en CI : `supabase start` + `supabase db reset` (+ `supabase db push` pour 0003) puis `npm run test`.**
- Rate limiter + request_id vérifiés par exécution réelle (tsx) : 1 open/2 s par user, buckets IP indépendants, header uuid repris/regénéré.
- `next build` non vérifiable en l'état : `next.config.ts` (B) importe `@serwist/next` non installé — dépendance du périmètre B.
- **Les 17 routes n'ont pas pu être exercées HTTP bout-en-bout** (build B bloqué + 0003 non appliquée nulle part). L'intégrité économique est couverte par le smoke-engine (RPC-level) ; la couche HTTP (auth/Zod/rate limit/mapping) est couverte par tsc + revue. C'est la dette principale de cette passe.

## Dettes / décisions Agent A

1. `POST /api/quests/claim` : le schéma `claimQuestsSchema` exige une `idempotency_key` mais la RPC `claim_quests` n'en prend pas (idempotente par jour) — la clé est acceptée au contrat et ignorée au transport.
2. `is_new_character` : garde de dérive d'horloge 3 s (Vercel/Supabase NTP-synced) ; un doublon du même perso dans LA MÊME ouverture est correctement marqué (la borne est capturée avant la RPC).
3. Recharge de stock : la logique ne vit que dans `open_booster` (RPC 0001). `GET /api/boosters/state` renvoie `next_recharge_at` tel quel (aucune recharge simulée en lecture — la RPC d'ouverture crédite le dû, conformément au schéma qui conditionne le stock à `last_booster_recharge`).
4. `handleApi` logge les 4xx métier en `info`/`warn` (error_code brut RPC en warn) et les 5xx en `error` — aucune donnée sensible.
