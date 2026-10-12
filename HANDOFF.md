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
   Violet←shojo).
4bis. **Exclus = 0** (directive orchestrateur) : `no_theme` et `adult_media` ne sont plus
   des exclusions — les untagged entrent en base avec `themes = '{}'` pour le booster MIX.
   Seules les exclusions structurelles restent (no_image / no_name, NOT NULL). Rapport :
   section "Untagged" (compte + top 20).
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

## ⚠️ Alerte cross-agents (constaté au seed)

- **Cloud : `POST /rpc/open_booster` → 404** (projet `pshtqnd…`). Les fonctions
  0001/0003 ne semblent pas déployées sur le cloud malgré HANDOFF §5 (« RPC
  présentes ») — les routes Agent A et le dev-seed seront cassés. À vérifier
  par Agent 0 / A (`supabase migration list` côté cloud OK pour 0000–0005,
  mais les fonctions manquent → re-push nécessaire ?).
- **Migration `0006_service_role_grants.sql`** (Agent C, bloquant seed) : voir
  `MIGRATIONS.md`. `0004` était déjà pris par l'Agent A — vérifier la
  numérotation avant toute nouvelle migration.

## Reste à faire (côté C)

1. ~~Seed live ≥ 3000 persos~~ ✅ **FAIT** : 5 000/5 000 insérés (parcours global
   complet, plafond AniList 5 000 entrées = fin naturelle), 0 exclus, raretés
   recalculées sur le pool complet. Distribution finale exacte : 50 M / 250 L /
   1000 E / 1250 R / 1500 U / 1250 C.
2. ✅ `verify.ts` exécuté : raretés/images/doublons **conformes** ; 5 échecs
   connus V1 = seuils ≥300/thème non atteignables sur la source unique
   (big3 180, isekai 142, seinen 203, shojo 133, webtoon 144 vs shonen 3 149).
   Levier documenté si besoin plus tard : passe d'enrichissement `--anime`
   ciblée sur les listes curatées (Jikan down ici a limité les rescues).
3. Vérifier les rescues Jikan (réseau dépendant — 0 rescue lors du seed).

## État du seed (final)

| Thème | Nb | | Rareté | Nb |
|---|---:|---|---|---:|
| shonen | 3 149 | | mythic | 50 |
| big3 | 180 | | legendary | 250 |
| isekai | 142 | | epic | 1 000 |
| seinen | 203 | | rare | 1 250 |
| shojo | 133 | | uncommon | 1 500 |
| webtoon | 144 | | common | 1 250 |
| **untagged** | **1 647** | | **total** | **5 000** |
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
| `lib/server/supabase.ts` | Clients serveur, source UNIQUE : `getUserClient()` (cookies, refresh session), `getServiceClient()` (scripts), `createPublicClient()` (sans cookies, lectures publiques/prerender). `lib/supabase/server.ts` (B) n'est plus qu'une façade ré-exportant ces fabriques — unification faite, ne pas re-dupliquer |
| `lib/server/auth.ts` | `requireUser()` (401) + `getRequestAuth()` non bloquante (client + user null) pour les routes publiques |
| `lib/server/ratelimit.ts` | Token bucket mémoire par user ET par IP, interface `RateLimiter` swappable. Policies : `open` 1/2 s, `mutation` 5/s, `read` 30/s |
| `lib/server/logger.ts` | Logger JSON structuré ; `request_id` propagé (`x-request-id`) |
| `lib/server/api-helpers.ts` | `handleApi` : request_id → auth (`'required'` défaut / `'optional'` / `'public'` — ctx.user null, rate limit IP seul) → rate limit → Zod → run() → mapping erreur → `{ error: CODE }` |
| `lib/server/dto.ts` | Mapping RPC → contrats (zod strict) ; `is_new_character` serveur ; hydratation 3 requêtes |
| `app/api/**` (21 routes) | boosters open/open-premium/daily/state, cards burn+`[id]`+apply/reroll-cosmetic, collection+album, quests GET+claim, shop/buy, wishlist GET+toggle, themes/`[slug]`/pool-info, me/login-streak + **me/showcase**, **profiles/check-username**, **profiles/username**, **`u/[username]`** |
| `scripts/smoke-engine.test.ts` | 8 scénarios vitest **Supabase local only** (garde hostname + `SMOKE_ENGINE_ALLOW_REMOTE=1`) : parallélisme 10 users, idempotence, pity L/M, doré ×10, daily 1/jour, **premium = 1 carte L min (85/15, corrigé post-0004)**, burn |
| Migrations (toutes **poussées sur le cloud**, `supabase db push`) | 0003 RPC lecture ×8 · 0004 premium 1 carte · 0005 fix `_next_paris_midnight` (at time zone ambigu sur date — prouvé embarqué + cloud) · 0007 profil public/username/vitrine (0006 = service_role grants, Agent 0). Détail : `MIGRATIONS.md` |

## État cloud vérifié (2026-10-12)

`count(themes)=6` ✓ · `get_booster_state` live (`PROFILE_NOT_FOUND` métier, pas PGRST202) · `get_next_reset_at` exact après 0005 (22:00Z en CEST) · `check_username`/`get_public_profile` live (dispo + format + 404 `PROFILE_NOT_FOUND`).

## Évolutions de contrat `types/api.ts` (Agent A, droit porté — B code contre ce fichier)

1. `OpenPremiumBoosterResponse.card` (1 carte, L min — 0004).
2. `ClaimDailyPackResponse` + **`is_golden`** (champ demandé par B — la RPC le renvoyait déjà).
3. Ajoutés : `CheckUsernameResponse`, `SetUsernameResponse`, `SetShowcaseResponse`, `PublicProfileDto`/`GetPublicProfileResponse` (contrat exact pour `components/profile/use-public-profile.ts` — migrable tel quel).
4. `CharacterSummaryDto.anime_title` : `string` → `string | null` (colonne nullable en 0000 — aligné sur le type régénéré).

## Demandes aux autres agents (ne pas contourner)

- **Agent 0 — `lib/errors.ts`** : **`PROFILE_NOT_FOUND` (404) AJOUTÉ par A** (ordre utilisateur direct, à valider en review) — mappe proprement le 404 profil public ; `PROFILE_NOT_FOUND` n'est plus dans la liste des codes en mapping conservateur. Restent en attente : `QUEST_NOT_COMPLETED`, `NO_COSMETIC_TO_REROLL`, `IDEMPOTENCY_IN_PROGRESS`, `EMPTY_POOL`, `EMPTY_CLAIM`, `INVALID_WEIGHTS` → 500 conservateur.
- **Agent 0 — P0 sécurité (pattern hérité 0001, à trancher)** : aucune RPC ne vérifie `p_user = auth.uid()` ; un user authentifié peut passer l'uuid d'un autre. Pattern proposé : `auth.uid() is null or p_user = auth.uid()` (laisse passer service_role). Affecte TOUTES les RPC 0001+0003+0007.
- **Agent 0 — CI (juge de paix)** : `.github/workflows/ci.yml` exécute `supabase db reset` + 2 vérifications psql mais **PAS `npm run test`** → les 8 scénarios de concurrence (jamais deux fois le même print) ne tournent nulle part. Ajouter dans le job `supabase` (après db reset) : `actions/setup-node` + `npm ci` + env `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` + `SUPABASE_SERVICE_ROLE_KEY=<clé locale>` + `npm run test`. Le commentaire du job mentionne encore « 0000 → 0001 → 0002 » (0003-0007 ajoutées depuis).
- **Agent 0 — `lib/config.ts`** : commentaire ligne 51 « (gratuit, premium et daily) » obsolète (`cardsPerBooster` ne s'applique plus au premium depuis 0004).
- **Agent 0 — `supabase/config.toml`** : absent du repo ; créé par A via `supabase init` pour le `db push`. À reprendre/review et commiter.
- **Agent 0 — `lib/validations/`** : `collectionQuerySchema` inline dans `app/api/collection/route.ts` + schémas username/showcase inline dans les nouvelles routes — à partager.
- **Agent B** : les 3 endpoints demandés sont live (contrats ci-dessus). `lib/supabase/server.ts` ré-exporte `lib/server/` : toute évolution de fabrique de client se fait côté `lib/server/supabase.ts`. `types/database.ts` section Functions étendue (RPC 0003+0007) — à régénérer par `supabase gen types`.

## Vérifications effectuées / limites

- `npx tsc --noEmit` : zéro erreur périmètre A ; 0 erreur dans `lib/supabase` (unification sans régression B).
- `npx eslint` périmètre A : 0 erreur/warning. `npx vitest run` : 32 verts, 8 smoke skipés (garde local-only voulue).
- Smoke économique sur vraie base : **toujours non exécuté localement (pas de Docker)** — la CI doit le faire (voir demande ci-dessus). Bout-en-bout HTTP des 21 routes : non exercé (auth navigateur requise) — le smoke manuel via l'app reste le juge.
- `next build` : vert côté B (B a résolu `@serwist/next` — plus bloquant).

---

# HANDOFF — Agent B (PROMPT B, pages /collection /shop /u/[username])

## Livré (périmètre B : pages game + composants)

| Fichier | Contenu |
|---|---|
| `app/[locale]/(game)/collection/page.tsx` | Shell serveur : `setRequestLocale`, thèmes publics via `lib/supabase/server.ts`, metadata. |
| `components/collection/collection-page.tsx` | Onglets Grille/Album (Tabs ui). Grille : `useInfiniteQuery` sur `getCollection` (queryKey = filtres), debounce recherche 300 ms, sentinelle IntersectionObserver + bouton "Charger plus", skeletons, empty states traduits. Cellules : `content-visibility: auto` + `contain-intrinsic-size` (virtualisation pragmatique zero-dep, commentée). |
| `components/collection/collection-filters.tsx` | Select thème, 6 pills rareté (codes `RARITY_CODE`, tokens `--rarity-*`, sélection unique), recherche, tri (recent/rarity/print_number/name — exécuté côté SQL). |
| `components/collection/card-sheet.tsx` | Fiche carte (Dialog) : `GameCard variant="detail"`, source, date d'obtention (`Intl.DateTimeFormat` selon locale), `owners_count` via `getCard(id)`, wishlist (toggle + slots used/max), cosmétiques par slot (apply depuis `user_cosmetics`→`cosmetics` en lecture Supabase browser, reroll), burn en confirmation 2 étapes avec preview indicative `burnValueFor` ("valeur indicative" affichée). Idempotence : `crypto.randomUUID()` généré dans chaque handler. Pas d'optimistic : pending → serveur → `invalidateQueries` → toast. |
| `components/collection/album-view.tsx` + `album-group.tsx` | Album : `getAlbum()`, barres de complétion par anime, possédés en `GameCard` mini (carte de présentation synthétique — l'album n'expose pas d'id de carte, seulement `best_print_number`), manquants en silhouette numérotée (index). |
| `app/[locale]/(game)/shop/page.tsx` | Shell serveur + metadata. |
| `components/shop/shop-page.tsx` | Catalogue en lecture publique `cosmetics` (Supabase browser, mappé en `CosmeticDto`), onglets Frames/Holos/Dyes, marqueur "Possédé" (`user_cosmetics`), achat `buyCosmetic` (idempotence par clic, toast + invalidation `my-cosmetics`/`booster-state`), erreur `INSUFFICIENT_CHAKRA` traduite via namespace `errors`. |
| `components/shop/cosmetic-tile.tsx` | Tuile cosmétique (prix chakra, badge ultra rare, actions) + vignette de carte. |
| `app/[locale]/(game)/u/[username]/page.tsx` | Shell serveur + metadata. |
| `components/profile/*` | Profil public : fetch typé `GET /api/u/[username]` → `PublicProfileDto` (endpoint provisoire, parsing `{ error: AppErrorCode }` identique à `lib/query/api`), 404 → empty state "profil introuvable", stats (cartes, persos uniques, % complétion, meilleur print en `GameCard` mini, meilleure rareté, streak Jx), vitrine ≤ 5 `GameCard variant="showcase"`, wishlist en tuiles sobres `next/image`. |
| `components/collection/section-boundary.tsx` | Error boundary réutilisable (fallback `common.error`/`retry`, retry = remount de la sous-arbre → refetch React Query). Utilisé sur chaque section (grille, album, catalogue, stats, vitrine, wishlist). |
| `components/cosmetic-dto.ts` | Mapping défensif ligne `cosmetics` → `CosmeticDto` (réaffûtage `string`/`Json`, zéro `as` dans les composants). |
| `components/date-format.ts` | Hook `useFormatDateTime` (locale next-intl). |
| `messages/{fr,en}/{collection,shop,profile}.json` | Namespaces auto-fusionnés par `lib/i18n/request.ts`, parité stricte vérifiée par script. Zéro literal UI. |

## Écarts constatés avec `types/api.ts` / validations (à traiter côté A/0)

1. **`WishlistToggleInput` ne prend PAS d'`idempotency_key`** (`lib/validations/wishlist.ts` : toggle naturellement idempotent, contrairement à l'instruction initiale B). Le frontend appelle `toggleWishlist({ character_id })` conformément au contrat.
2. **`GET /api/u/[username]` provisoire** : absent de `lib/query/api.ts` (contrat) — codé en fetch direct typé `PublicProfileDto` dans `components/profile/use-public-profile.ts`, parsing d'erreur identique (`ApiError`). À migrer dans `lib/query/api.ts` quand A livre la route.
3. **`collectionQuerySchema` inline côté A** (déjà signalé par A) : B duplique le type `CollectionQueryParams` côté client via `types/api.ts` — cohérent, pas de drift constaté.

## Décisions B

1. **Burn : confirmation en 2 états dans la fiche** (qui est déjà un Dialog) plutôt qu'un Dialog imbriqué — mêmes garanties, moins de risques de focus trap.
2. **Cartes de présentation synthétiques** (album, meilleur print) : `CardDto` fabriqués en mémoire (id préfixé `album-`/`best-print-`, jamais passés à une mutation) pour réutiliser `GameCard` — le contrat n'expose pas de vraie carte dans ces contextes.
3. **Preview indicative burn** : `burnValueFor(rarity, wishlist_count)` affiché avec mention "valeur indicative" ; le montant affiché au toast vient de `chakra_gained` serveur.
4. **Grille > 500 cartes** : pas de lib de virtualisation ; `content-visibility` + `contain-intrinsic-size` sur les cellules (note en commentaire dans `collection-page.tsx`).

## Vérifications effectuées

- `npx next typegen` : routes `/[locale]/collection`, `/[locale]/shop`, `/[locale]/u/[username]` générées dans `.next/types/routes.d.ts`.
- `npx tsc --noEmit` : **zéro erreur sur tout le repo** (le souci JSDoc `components/legal/legal-page.tsx` signalé par A est déjà résolu dans le fichier actuel).
- `npx eslint` sur tout le périmètre B : 0 erreur, 0 warning.
- Parité des clés fr/en des 3 namespaces vérifiée par script.
- **Non vérifié** : rendu HTTP bout-en-bout (les routes A `get_collection_page`/`get_album`/… dépendent de la migration 0003 non appliquée sur le cloud ; `next dev` tourne peut-être chez d'autres agents). Premier smoke manuel dev : ouvrir `/fr/collection`, `/fr/shop`, `/fr/u/<username>` avec un user seedé.

---

# HANDOFF — Agent B (UI Core) — SYNTHÈSE FINALE (PROMPT B complet)

> Cette section complète et prend le pas sur la section partielle « Agent B
> (pages /collection /shop /u/[username]) » ci-dessus (même livrable, vue
> complète : fondations + auth + PWA + landing + /boosters + placeholders D).

## Livré

**i18n** : `lib/i18n/{routing,request,navigation}.ts` (locales fr/en,
localePrefix 'always', `timeZone: 'Europe/Paris'` dans request.ts ET passé au
`NextIntlClientProvider` — requis sinon IntlError ENVIRONMENT_FALLBACK au
prerender). Mécanisme de namespaces : `messages/{locale}.json` + tous les
`messages/{locale}/*.json` auto-fusionnés (clé = nom de fichier) — les agents
suivants déposent leur JSON sans rien modifier d'autre. `next-intl/plugin`
(createNextIntlPlugin dans next.config.ts).

**Pages** : `/` (landing : héro glassmorphism mesuré, 3 étapes double
rareté + print, CTA login), `/login` (magic link + Discord OAuth — login
UNIQUEMENT), `/onboarding` (username temps réel), `/boosters` (grille 6
thèmes, panneau pool + "X de tes envies", ouverture/premium avec
idempotence par clic, state-bar polling 30 s + décompte smooth cosmétique,
widgets pity/doré/daily/quêtes/streak), `/collection` (Grille/Album,
filtres, fiche carte, burn, cosmétiques, wishlist), `/shop` (Frames/Holos/
Dyes + aperçu live), `/u/[username]` (profil public), `/offline`,
3 pages légales. Toutes sous `app/[locale]/…`, liens via
`@/lib/i18n/navigation`.

**Auth/session** : `lib/supabase/{client,server,middleware}.ts` +
`app/[locale]/auth/callback/route.ts` (échange code PKCE, hook streak
best-effort, redirection onboarding ou /). Le callback vit SOUS le préfixe
de locale : le proxy i18n rebascule toute URL non préfixée vers `/fr/…`,
donc `/auth/callback` nu 404ait. Client navigateur en `flowType: 'pkce'`
(sinon le magic link revient en `#fragment` que le route handler ne voit
jamais). Pages d'erreur traduites : `app/[locale]/error.tsx`,
`app/[locale]/not-found.tsx` (+ catch-all `app/[locale]/[...rest]/page.tsx`
pour déclencher la 404 traduite dans le segment localisé).
`proxy.ts` (racine) = ex-middleware Next 16 :
refresh session Supabase + garde /boosters|/collection|/shop|/onboarding +
routing next-intl.

⚠️ **Mailer Supabase en panne** (constaté au test e2e du 2026-10-12) :
`POST /auth/v1/otp` renvoie 500 « Error sending magic link email » même
sans options → les magic links n'arrivent pas. À vérifier dans le dashboard
projet (SMTP custom / rate limit). Le `redirect_to`
`/{locale}/auth/callback` est lui bien accepté (la requête atteint l'étape
envoi). Sessions et OAuth non affectés côté code.

**PWA** : `@serwist/turbopack` (route handler `app/serwist/[path]/route.ts`
→ SW servi à `/serwist/sw.js`, vérifié HTTP 200 avec precache manifest ;
`@serwist/next` webpack retiré — inactif sous le build Turbopack de Next 16).
SW : precache shell, AniList/MAL StaleWhileRevalidate maxEntries 200,
fallback navigation → /fr/offline, skipWaiting + clientsClaim. Registration
prod-only (`lib/pwa/register.ts`). Bannière d'install (beforeinstallprompt,
dismiss localStorage 7 j, CTA iOS dédié), `lib/hooks/use-pwa.ts`,
`public/manifest.webmanifest` conservé.

**Placeholders Agent D (contrat exact à remplacer)** :
`components/game-card/{game-card,card-back,index}.ts(x)` (ratio TCG, cadre
rareté, badge print via `printVisualTier`, first owner, overlays
`css_config`, fallback image → silhouette+initiale ; variants grid/detail/
showcase) et `components/booster-opening/booster-opening.tsx`
(`{cards, isGolden, onComplete}`, overlay clavier Échap/Entrée, aucun fetch).
Tous marqués « PLACEHOLDER AGENT B » en en-tête. D refactorise tout rendu
carte vers `game-card/` et remplace ces deux dossiers.

**Conventions Next 16 `cacheComponents` (obligatoires pour tout agent
front)** :
- Aucun `Date.now()`/`new Date()` pendant le render (prerender bloqué) :
  utiliser `lib/hooks/use-now.ts` (`useNowSeconds`, useSyncExternalStore,
  snapshot serveur 0) — `use-booster-timer` et les countdowns l'utilisent.
- Aucun setState synchrone dans un effet (règle eslint
  react-hooks/set-state-in-effect) : dériver pendant le render.
- Données publiques serveur : `createPublicClient()` (SANS cookies) +
  fonction `'use cache'` (fetch Supabase non caché = prerender bloqué).
- Route dynamique avec params : shell synchrone + enfant async sous
  `<Suspense>` (cf. `app/[locale]/(game)/u/[username]/page.tsx`).
- `dynamicParams` est incompatible avec cacheComponents (retiré).

## Vérifications (périmètre B)

- `npx tsc --noEmit` : 0 erreur (repo entier).
- `npx eslint` : 0 erreur B. (Restent 2 erreurs `prefer-const` dans
  `pipeline/ingest.ts` — territoire Agent C.)
- `npx next build` : vert — 50/50 pages prerendues (shells statiques par
  locale, /u/[username] en partial prerender), proxy compilé.
- Parité fr/en vérifiée par script : 240 clés des deux côtés.
- Smoke HTTP sur `next start` : `/fr` 200, `/fr/offline` 200,
  `/serwist/sw.js` 200 (38 KB, precache manifest présent).

## Écarts / demandes aux autres agents

**Pour l'Agent A (endpoints manquants du contrat, codés côté B contre ces
signatures provisoires)** :
1. `GET /api/profiles/check-username?username=…` → `{ available: boolean }`
   (onboarding, vérification temps réel).
2. `POST /api/profiles/username` `{ username }` → 200 ou
   `{ error: 'USERNAME_TAKEN' | 'INVALID_USERNAME' }`.
3. `GET /api/u/[username]` → `PublicProfileDto` (profil public ; absent de
   `lib/query/api.ts`, fetch direct typé dans
   `components/profile/use-public-profile.ts` — à migrer dans le client API
   quand la route existe).
4. `ClaimDailyPackResponse` n'a pas de champ `is_golden` (contrairement à
   open/open-premium) — guard défensif `false` côté B ; ajouter le champ au
   type si la RPC le prévoit.

**Pour l'Agent A (alignement)** : `lib/supabase/` est une couche B
provisoire (client serveur + middleware updateSession). A peut l'aligner
avec `lib/server/` ou la consommer — décision à prendre, ne pas dupliquer.

**Pour l'Agent D** : référence visuelle dans `design-reference/` —
**consulter ces screenshots AVANT tout travail visuel** (convention de
nommage dans `design-reference/README.md`). Remplacer les deux placeholders
(game-card, booster-opening) — contrats de props exacts ci-dessus. Tout
rendu carte actuel passe déjà par `GameCard`. Les sons/particules/60fps de
la séquence sont à implémenter dans `booster-opening/`.

**Pour l'Agent E (audit)** : CSP en dev inclut `'unsafe-eval'` (HMR
turbopack) — headers appliqués aussi en dev par simplicité ; à auditer.
`.env.example` : `DISCORD_REDIRECT_URI=…/api/auth/callback/discord` ≠
callback frontend `/{locale}/auth/callback` (Supabase gère l'OAuth).
Budget first-load JS < 200 KB gzip non mesuré (à la charge d'E).

**Pour l'architecte (SPEC à mettre à jour)** : §2.1 dit `middleware.ts` →
c'est `proxy.ts` en Next 16 ; le fallback offline est `/fr/offline` (toutes
les pages sont sous préfixe de locale).

---

# HANDOFF — Agent D (PROMPT D, Juice & Polish)

> Branche `agent/juice`, 5 commits par sujet (assets → game-card → opening →
> i18n → handoff). Placeholders « PLACEHOLDER AGENT B » remplacés
> (`components/game-card/`, `components/booster-opening/`).

## Livré (périmètre D)

| Fichier | Contenu |
|---|---|
| `scripts/generate-assets.mjs` | Génération procédurale : SVG artisanal → PNG via `sharp` (déjà dans node_modules, dép transitif — NON ajouté au package.json) ; synthèse PCM déterministe → WAV. **Nouveau fichier hors cartographie SPEC §2.7** (aucun slot « assets » prévu) — à ratifier. Régénération : `node scripts/generate-assets.mjs` |
| `public/packs/{shonen,shojo,webtoon,big3,seinen,isekai,mix}.png` | Pack arts 3:4, kanji médaillon (少/花/文/王/青/異/混), accent de thème, ~200 Ko chacun (palette quantifiée, budget 4G/precache PWA). **Chemins déjà seedés dans `themes.pack_art_url`** → la grille B les affiche dès maintenant |
| `public/card-back.png` | Verso seigaiha sombre + médaillon or 漫 (2.5:3.5 rendu 5/7), 148 Ko |
| `public/sounds/*.wav` ×8 | tear/flip/rare/epic/legendary/mythic/coin/click, 4–79 Ko (budget < 200 KB respecté). **Format WAV et non mp3** : aucun encodeur MP3 disponible hors-ligne ; WAV = synthèse maison, CC0 par construction, lecture universelle. Prompts IA de remplacement : `assets/prompts.md` |
| `components/game-card/` | Carte définitif : ratio TCG 5/7, 6 cadres rareté (tokens `--rarity-*`), gems d'angle Épique+, halo animé L/M (opacity), print gravé `#NNNN/total` sur l'image + badge tier (config `printVisualTiers`, shimmer transform-only), code rareté TCG, overlays css_config défensifs (frame/holo/dye), tilt desktop, fallback silhouette. **Contrat de props inchangé** (`{card, variant}`) |
| `components/effects/` | `Tilt` (pointer fin, rAF, mutations DOM directes, will-change parcimonieux) + `useReducedMotion` (useSyncExternalStore, cacheComponents-safe) |
| `components/booster-opening/` | Séquence complète : tear-screen (drag pointer + fallback bouton, confettis, halo) → reveal-deck (state machine, Espace/maintenir/Échap, Tout révéler) → card-reveal (flip 3D, intensité C→M) → recap (éventail, meilleure carte, copier le lien, **PNG 1200×630 via canvas maison** : satori/resvg/html-to-image non installés, zéro-dep choisi + silhouette de repli CORS) + particles canvas (< 300 nœuds, DPR capé 2) + sounds WebAudio (unlock 1er geste, preload tear/flip) |
| `messages/{fr,en}/opening.json` | Namespace `opening` déposé selon la convention de fusion (aucun fichier B touché), parité fr/en |

## Contrat B↔D

- `GameCardProps` / `BoosterOpeningProps` : **signatures stables respectées**.
- `BoosterOpening` gagne 2 props **optionnelles additives** : `packSlug`,
  `packName` (défaut `mix`). Sans elles la séquence marche (pack générique).
- Aucun rendu carte hors `game-card/` détecté (B avait déjà tout
  centralisé) → **aucun refactor nécessaire**.

## Demandes

- **Agent B — câblage pack art (actionnable tel quel, périmètre B)** :
  1. Fichier : `components/boosters/boosters-page.tsx` (seul endroit qui
     monte `<BoosterOpening>`, lignes ~97-103) — D n'a PAS touché ce
     fichier, à toi de l'éditer.
  2. Élargir `OpeningState` pour porter le pack :
     ```ts
     interface OpeningState {
       cards: OpenedCardDto[];
       isGolden: boolean;
       packSlug?: string;   // slug thème, ex. 'shonen' | 'mix'
       packName?: string;   // nom déjà localisé (name_fr/name_en selon locale)
     }
     ```
  3. Au montage : `<BoosterOpening cards isGolden onComplete
     packSlug={opening.packSlug} packName={opening.packName} />`.
  4. Renseigner les valeurs : `ThemePanel.onOpened` connaît le thème
     sélectionné (`selectedTheme.slug` + nom localisé du `ThemeDto`) ;
     pour `DailyPackWidget`, la réponse `ClaimDailyPackResponse.theme`
     (`ThemeDto.slug` + nom) est disponible dans le handler — la passer
     dans le callback `onOpened` (signature du callback à élargir chez B).
  5. Contrat côté D (déjà livré, `components/booster-opening/booster-opening.tsx`) :
     ```ts
     packSlug?: string; // défaut 'mix' ; slugs acceptés: shonen|shojo|webtoon|big3|seinen|isekai|mix (inconnu → 'mix')
     packName?: string; // défaut: 'Booster Mix' traduit (namespace opening.themes)
     ```
  6. Fallback actuel sans câblage : pack générique `mix` + nom traduit —
     la séquence est déjà fonctionnelle, ce câblage n'est que du polish.
  7. Bonus (pas demandé) : `.buttonShimmer` exporté dans
     `game-card.module.css` si tu veux un shimmer sobre sur tes boutons
     premium.
- **Agent E** : Definition of Done perf **non mesurée ici** (pas de
  DevTools dans cet environnement). Procédure exacte à exécuter telle
  quelle (Chrome DevTools, onglet Performance) :
  1. `npm run build && npm start`, ouvrir `/fr/boosters`, login seed,
     DevTools → Performance : Network throttling **Fast 4G**, CPU
     **4× slowdown**, `Disable cache` coché.
  2. Scénario A (nominal) : déchirure complète par drag → laisser la
     séquence jouer les 5 reveals sans intervention (~20-25 s).
  3. Scénario B (skip) : Échap pendant le reveal → récap.
  4. Scénario C (Mythique) : dev-seed un booster dont une carte est M
     (ou forcer `cards[0]` mythic en dev) → reveal de cette carte.
  5. Pour chaque scénario : enregistrer, relever **% de frames dropées**
     (frames > 50 ms dans le thread principal) et jank longues tâches.
     **DoD : frame drops < 5 %** sur les 3 scénarios. Comparer aussi avec
     `prefers-reduced-motion: reduce` activé (doit être plat).
  6. Points de vigilance si rouge : halo/rays (opacity/conic ok mais le
     blur ?), canvas particules (doit rester < 300 nœuds et DPR ≤ 2 —
     vérifier `devicePixelRatio` de la machine de test), `backdrop-blur`
     de l'overlay (déjà suspect n°1 sur mobile réel).
- **Agent 0 / orchestrateur** : `scripts/generate-assets.mjs` nouveau
  fichier (voir Livré). Sons WAV vs mp3 de la spec (voir Livré).

## Vérifications effectuées

- `npx tsc --noEmit` : 0 erreur hors `tests/` (dossier **non suivi**,
  travail en cours Agent E dans l'arbre partagé — ne pas committer).
- `npx eslint` périmètre D : 0 erreur, 0 warning (React 19 :
  `react-hooks/refs` respecté — pas d'accès ref pendant le render).
- `next build` : à tourner côté CI (voir sujet suivant dans ce handoff).

## Limites connues

- PNG de partage : si CORS AniList refuse le canvas (tain), les cartes
  sont dessinées en silhouette — le PNG est toujours généré.
- Booster MIX : `open_booster` doit accepter `theme_slug='mix'` (déjà
  signalé par C) ; l'asset `mix.png` est prêt et le fallback l'utilise.


---

# HANDOFF — Agent E (QA & Économie)

## Livré

- **Property tests RNG** : `tests/rng.property.test.ts` — 100k rolls à ±0,3 pt des
  poids (booster/doré/daily/premium), propriétés fast-check (bornes, monotonie,
  somme 100), chi² d'uniformité `_pick_character` (pools 2→1 000). fast-check
  ajouté en devDependency.
- **Tests métier** : `tests/economy.business.test.ts` (13 tests : daily 1/j strict,
  streak J1/J7/reset/trou, cap wishlist, points premium aux frontières, doré
  cross-type, reset pity, quête `obtain_epic_plus`, idempotence `claim_quests`,
  double achat cosmétique, reroll sans cosmétique).
- **Tests concurrence** : `tests/concurrency.test.ts` (idempotence clé ×5, pool
  d'1 perso = 200 prints distincts, burn pendant ouvertures parallèles, recharge
  jamais négative).
- **Garde config** : `tests/config-drift.test.ts` — le SQL live ne dérive pas de
  `lib/config.ts` (poids, pity 25/200, doré, recharge, burn table, premium).
- **Fixtures/CI** : `tests/helpers.ts` (garde local-only stricte : jamais de test
  DB sur le cloud sauf `SMOKE_ENGINE_ALLOW_REMOTE=1`, users jetables, retry,
  cleanup). Les tests DB tournent en CI locale comme le smoke engine de A —
  **premier run à faire là-bas** (pas de Docker sur le poste d'E).
- **Audit RLS/RPC** : `tests/rls-audit.test.ts` (16/16 exécutés sur cloud,
  isolation table par table, readbacks cross-user), `scripts/audit-cloud.ts`
  (9 preuves), `scripts/probe-cloud.ts` (read-only), `scripts/purge-cloud-fixtures.ts`.
- **Simulation économique** : `scripts/sim-economy.ts` — Monte-Carlo déterministe
  50 joueurs × 30 jours, réplique vérifiée ligne par ligne contre 0001
  (pity à compteur, doré ×2 non appliqué au daily, premium = 4 rolls + slot
  garanti 85/15, streak SQL). Rapports : `report-economy.md` + 3 variantes
  (`pity-reset-naturel`, `streak-config`, `wishlist-avg 1000`).
- **Documents** : `QA_REPORT.md` (trous classés P0/P1/P2), `ECONOMY_PATCH.md`
  (leviers L1–L5 chiffrés avant/après — E ne décide rien).

## Écarts trouvés (détail et preuves dans QA_REPORT.md)

- **P0 — E-01** : aucune RPC ne vérifie `p_user = auth.uid()` → un joueur agit
  sur le compte d'un autre (preuves cloud : booster, daily, wishlist, profil,
  achat). Fix suggéré par A (garde `auth.uid()` en tête de RPC). **Agent 0**.
- **P1 — E-02** : cap wishlist 10 absent (`WISHLIST_FULL` jamais levé ; 12
  entrées acceptées sur cloud). **Agent 0** (RPC).
- **P1 — E-03** : streak SQL `least(streak,10)*5` ≠ `chakraByDay` de la config
  (J1 = 5 live ; standard n°12). **Agent 0**.
- **P1 — E-04** : rachat d'un cosmétique possédé = double débit silencieux
  (`ON CONFLICT DO NOTHING` après débit). **Agent 0**.
- **P1 — E-07** : `get_public_profile` (0007) plante `column uc.rarity does not
  exist` → `/u/[username]` cassée dès qu'un joueur a des cartes. **Agent 0**.
- **P1 — E-08** : grants service_role du cloud limités à `characters` (0006) —
  les scripts hors RPC (dev-seed, refill smoke) cassent en prod alors que le
  local passe tout (CI localement verte). **Agent 0** (grants explicités).
- **P2 — E-05** : daily pack sans progression `obtain_epic_plus`. **Agent 0**.
- **P2 — E-06** : booster MIX toujours non câblé (thème `mix` absent du seed,
  pas de branche RPC) — décision V1 de C en suspens, asset D prêt. **Agent 0**.
- **P2 — E-09** : CSP prod avec `'unsafe-eval'`/`'unsafe-inline'` (headers()
  identique dev/prod ; commentaire de `next.config.ts` mensonger). **Agent B**.
- **P2 — E-10** : variables Discord fantômes dans `.env.example`
  (`DISCORD_REDIRECT_URI` → route inexistante ; rien n'utilise ces vars).
  **Agent B/0**.
- **Économie** (ECONOMY_PATCH.md) : pas de puits après épuisement boutique ~J26
  (stock +~600/j) ; daily pack = 48 % des L ; multiplicateur wishlist
  inflationniste (×2 demande → ×2,8 stock) ; recharge exploitable ~250 ouv./jour.
  Décisions design requises.

## Demandes (ne pas contourner)

- **Agent 0** : E-01 → E-08 sont tous en migrations/RPC/seeds — priorité E-01
  avant toute ouverture du cloud à des vrais joueurs. Les `it.fails` des tests E
  passent au rouge quand le trou est corrigé (c'est leur rôle : les basculer en
  attendu fait partie du fix). Registre owner/fichier racine : QA_REPORT.md.
- **Agent A** : la couverture smoke de `get_public_profile` ne teste que le 404
  (E-07 a filtré) ; ajouter un cas avec cartes une fois 0 corrigé.
- **Agent B** : E-09 (CSP prod), E-10 (.env.example).
- **Tous** : ne pas « réparer » les `it.fails` en les supprimant — chacun
  référence un trou documenté dans QA_REPORT.md.

## Les 41 tests skippés localement — attendus au premier run CI

Ils sont skippés ici par garde (`tests/helpers.ts` refuse tout run DB hors
Supabase local) ; le job `supabase` de la CI démarre la stack locale puis lance
`npm run test`, donc **leur premier exécution réelle sera le run CI de la PR
agent/qa**. Attendu : les 3 `it.fails` AUTHZ (E-01) et les `it.fails` E-02/E-03/
E-05/E-06 passent (le trou y est encore) ; tout le reste passe au vert.

- `scripts/smoke-engine.test.ts` (8 — Agent A, déjà verts en CI) : prints
  dupliqués ×10 users parallèles ; idempotence clé ×3 ; pity L 25 ; pity M 200 ;
  doré toutes les 10 ; daily 1/j Épique+ idempotent ; premium 10 pts 85/15 ;
  burn ownership/crédit/idempotence.
- `tests/rls-audit.test.ts` (16 — exécutés sur cloud pendant l'audit, premier
  run local en CI) : 12 tests d'isolation table par table + readbacks ;
  **`it.fails` « get_public_profile fonctionne » (E-07)** ; **`it.fails` ×3
  AUTHZ open_booster / toggle_wishlist / set_username cross-user (E-01)**.
- `tests/economy.business.test.ts` (13 — jamais exécutés) : streak J1→J6 vs
  config, no-op même jour, reset après trou, J7 cosmétique ; **`it.fails` cap
  wishlist (E-02)** ; toggle wishlist couple wishlist_count ; points premium
  frontières 99→104 / 195→200 ; doré cross-type au 10e ; pity L reset visible ;
  **`it.fails` obtain_epic_plus daily (E-05)** ; claim_quests idempotent ;
  **`it.fails` double achat cosmétique (E-04)** ; reroll sans cosmétique.
- `tests/concurrency.test.ts` (4 — jamais exécutés) : burn pendant ouvertures
  parallèles ; même idempotency_key ×5 = 1 débit ; pool d'1 perso = 40 prints
  distincts ; recharge jamais < 0.

## Statut fixtures cloud (72 personnages)

Physiquement présents sur le cloud, **neutralisés** (`themes = []` → hors pool
de tirage, inoffensifs pour l'économie), non supprimés car 0006 ne grante pas
DELETE sur `characters` au service_role (E-08). Purge physique = décision Agent 0
(hotfix 0008). Les 2 users de test, eux, sont supprimés (purge re-verifiée en
fin de passe).

## Perf séquence D — procédure et statut

Definition of Done perf confiée à E par la section D (HANDOFF.md lignes
511-529) : **non mesurée sur ce poste** (pas de Chrome DevTools dans cet
environnement). Procédure à exécuter telle quelle au prochain poste équipé —
`npm run build && npm start`, `/fr/boosters`, DevTools → Performance, Fast 4G +
CPU 4× + Disable cache ; 3 scénarios (nominal ~20-25 s, Échap→récap, reveal
Mythique) ; **DoD : frame drops < 5 %** sur les 3, et plat sous
`prefers-reduced-motion: reduce`. Points de vigilance si rouge : blur halo/rays,
canvas particules (< 300 nœuds, DPR ≤ 2), `backdrop-blur` de l'overlay.
Reportée à la V1.1 (re-audit E) ou à l'orchestrateur.

## Vérifications effectuées

- Cloud (audit autorisé, users de test, nettoyage après) : RLS 16/16, 9 preuves
  d'exploitation cross-user, purge confirmée en fin de passe.
- Local : `npm run test` 60 passed / 41 skipped / 0 failed ; `tsc --noEmit` 0
  erreur ; `eslint` propre ; les 4 rapports économiques régénérés de façon
  reproductible (graines fixes).

## Limites connues

- Tests DB (métier/concurrence) **non exécutés sur ce poste** (pas de Docker) —
  premier run en CI locale, comme le smoke engine de A à ses débuts.
- 72 personnages de fixture restent physiquement sur le cloud, neutralisés
  (`themes = []`, hors pool) — 0006 ne grante pas DELETE sur `characters` au
  service_role (lié à E-08). Purge physique à trancher par Agent 0.
- La sim économie modélise 10 ouvertures/j ; le rythme réel dépend des joueurs
  humains (recharge exploitable ~250/j, non plafonnée).
