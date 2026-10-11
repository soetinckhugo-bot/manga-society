# MANGA SOCIETY — SPECIFICATION D'ARCHITECTURE

> Document de référence unique pour tous les agents. Un agent qui n'a jamais parlé au client
> doit pouvoir livrer sa feature rien qu'avec ce fichier + `supabase/schema.sql` +
> `types/api.ts` + `lib/config.ts`. Tout écart constaté avec la réalité du code → `HANDOFF.md`.
>
> Produit : site web gratuit de collection de cartes anime/manga, installable (PWA).
> Pas de combat, pas de stats, pas de monnaie réelle. i18n FR/EN.

---

## 1. Rappel métier (référence commune)

- **Double rareté** : (1) rareté du personnage, 6 tiers (`common`, `uncommon`, `rare`,
  `epic`, `legendary`, `mythic`), calculée par percentile de `favourites` AniList
  (top 1 % Mythic, 1→5 % Legendary, 5→20 % Epic, 20→45 % Rare, 45→75 % Uncommon, reste
  Common), overridable manuellement (`rarity_overridden`). (2) **Print Karuta** :
  `print_number` unique et séquentiel **par personnage**, gravé à l'obtention, atomique,
  jamais recyclé. Aucun numéro global.
- **First owner** : badge si la carte a été obtenue dans un booster/premium/daily
  (`source in ('booster','premium','daily')`), jamais pour quêtes/cadeaux.
- **Économie** : booster gratuit (5 cartes, 6 thèmes, recharge +1/6 min, stock max 10) ;
  pity visible (L ≤ 25, M ≤ 200) ; booster doré tous les 10 (taux ×2) ; pack du jour
  gratuit 1/jour (Épique min, roll E+) ; chakra (burn × demande wishlist, quêtes, streak
  J7) ; points premium (+1/100 cartes, 10 pts = 1 carte Légendaire min, roll 85/15) ;
  wishlist 10 slots ; album mode (silhouettes par anime).
- **Auth** : Supabase Auth — email magic link + Discord OAuth. Discord n'est QU'une
  méthode de login, aucun bot, aucune gateway.
- **Règle d'or** : 100 % de l'économie vit côté serveur (RPC Postgres SECURITY DEFINER).
  Le client affiche et appelle, jamais calcule ni mutate directement.

---

## 2. Arborescence complète

### 2.1 `app/` — App Router (Next 16)

```
app/
├── layout.tsx                    # Root layout : html lang, providers, header/footer,
│                                 #   bannière PWA, fonts, metadata/manifest link
├── page.tsx                      # / — landing : héro, explication double rareté, CTA login
├── globals.css                   # Tailwind 4 + tokens du design system (raretés, cosmétiques)
├── (auth)/
│   ├── login/page.tsx            # /login — magic link email + bouton Discord OAuth
│   ├── callback/route.ts         # /auth/callback — échange code Supabase, hook streak,
│   │                             #   redirection onboarding ou /
│   └── onboarding/page.tsx       # choix du username (citext, dispo temps réel), 1ère session
├── (game)/
│   ├── boosters/page.tsx         # /boosters — LA page de jeu (grille thèmes, panneau,
│   │                             #   pity, doré, pack du jour, quêtes, streak)
│   ├── collection/page.tsx       # /collection — onglets Grille / Album, filtres, fiche carte
│   ├── shop/page.tsx             # /shop — onglets Frames/Holos/Dyes, aperçu live, achat
│   └── u/[username]/page.tsx     # /u/[username] — profil public (stats, vitrine, wishlist)
├── offline/page.tsx              # /offline — page dédiée fallback service worker
├── (legal)/
│   ├── mentions-legales/page.tsx # mentions légales (obligatoire FR, hébergeur Vercel)
│   ├── cgu/page.tsx              # conditions d'utilisation
│   └── confidentialite/page.tsx  # politique de confidentialité (auth, données AniList)
├── api/                          # ROUTE HANDLERS — couche mince au-dessus des RPC (Agent A)
│   ├── boosters/
│   │   ├── open/route.ts         # POST /api/boosters/open (idempotency_key requise)
│   │   ├── open-premium/route.ts # POST /api/boosters/open-premium (10 points)
│   │   ├── daily/route.ts        # POST /api/boosters/daily (+ next_reset_at minuit Paris)
│   │   └── state/route.ts        # GET /api/boosters/state (polling 30s, solide 500 rps)
│   ├── cards/
│   │   ├── burn/route.ts         # POST /api/cards/burn → { chakra_gained, new_balance }
│   │   └── [id]/
│   │           ├── route.ts      # GET /api/cards/:id — détail + nb de joueurs possédant
│   │           ├── apply-cosmetic/route.ts   # POST (frame/holo/dye, 1 instance/type)
│   │           └── reroll-cosmetic/route.ts  # POST (brûle l'instance, crédite un autre)
│   ├── collection/
│   │   ├── route.ts              # GET /api/collection — cursor-based, filtres SQL
│   │   └── album/route.ts        # GET /api/collection/album — manquants groupés par anime
│   ├── quests/route.ts           # GET /api/quests — 3 quêtes du jour + progression
│   ├── shop/buy/route.ts         # POST /api/shop/buy — achat cosmétique chakra
│   ├── wishlist/
│   │   ├── route.ts              # GET /api/wishlist
│   │   └── toggle/route.ts       # POST /api/wishlist/toggle (cap 10, 'WISHLIST_FULL')
│   ├── themes/[slug]/pool-info/route.ts  # GET — nb persos/tier + nb envies présentes
│   └── me/login-streak/route.ts  # POST — hook login (idempotent), appelé depuis /auth/callback
├── icon.svg / icon.png           # icônes app (générées, cf. public/)
├── manifest.ts OU public/manifest.webmanifest  # manifest PWA (Agent 0 fournit le .webmanifest)
└── sw.ts                         # service worker @serwist/next (build, registration prod only)
```

Notes de frontière :
- `middleware.ts` (racine, hors `app/`) appartient à l'Agent B (routing next-intl + refresh
  session). L'authentification d'accès aux routes API se fait par `requireUser()` côté
  handler (Agent A, `lib/server/`), PAS dans middleware.
- La séquence d'ouverture de booster n'est PAS une route : c'est un composant client
  (`components/booster-opening/`, Agent D) monté par `app/(game)/boosters/page.tsx` (Agent B)
  avec les données reçues en props au clic.

### 2.2 `components/`

```
components/
├── ui/                           # shadcn/ui générés (button, dialog, tabs, toast, …) — Agent B
├── layout/                       # header, footer, bannière PWA, nav — Agent B
│   ├── header.tsx
│   ├── footer.tsx
│   └── install-banner.tsx        # bannière d'install (beforeinstallprompt, iOS dédié)
├── boosters/                     # panneau de sélection thème, widgets pity/doré/pack/quêtes — Agent B
├── collection/                   # grille, filtres, fiche carte (utilise game-card), album — Agent B
├── shop/                         # onglets cosmétiques, aperçu live — Agent B
├── profile/                      # stats, vitrine, wishlist publique — Agent B
├── auth/                         # formulaire magic link, bouton Discord, onboarding — Agent B
├── providers.tsx                 # QueryClientProvider + next-intl + theme — Agent B
├── game-card/                    # ★ Agent D SEUL — rendu carte définitif (ratio TCG, cadre
│   ├── game-card.tsx             #   rareté, badge print, first owner, overlays css_config)
│   ├── card-back.tsx             #   verso (préchargé dès l'écran pack)
│   └── index.ts                  #   export unique — TOUT rendu carte passe par ici
├── booster-opening/              # ★ Agent D SEUL — séquence d'ouverture complète
│   ├── booster-opening.tsx       #   <BoosterOpening cards isGolden onComplete> (contrat B↔D)
│   ├── tear-screen.tsx           #   écran pack + déchirure pointer-drag
│   ├── reveal-deck.tsx           #   5 cartes face cachée + progression + skip clavier
│   ├── card-reveal.tsx           #   flip 3D + intensité par rareté
│   ├── recap.tsx                 #   éventail, meilleure carte, boutons, PNG partageable
│   ├── particles/                #   canvas maison confettis/particules (< 300 nœuds)
│   └── sounds.ts                 #   lecture sons CC0 (< 200KB, preload 2-3 premiers)
└── effects/                      # ★ Agent D SEUL — tilt 3D, shimmer, transitions
```

### 2.3 `lib/`

```
lib/
├── config.ts                     # ★ Agent 0 — SOURCE UNIQUE d'équilibrage (poids, pity,
│                                 #   burn, recharge, seuils print, cap wishlist, cadences).
│                                 #   Lecture seule pour tous les agents. Jamais de valeur
│                                 #   en dur ailleurs → refus de review.
├── errors.ts                     # ★ Agent 0 — enum union des codes d'erreur métier
│                                 #   ('NO_BOOSTER', 'INVALID_THEME', 'NOT_ENOUGH_POINTS',
│                                 #   'ALREADY_CLAIMED', 'WISHLIST_FULL', 'RATE_LIMITED',
│                                 #   'NOT_OWNER', 'INSUFFICIENT_CHAKRA', …). Le client
│                                 #   traduit via messages/, le serveur ne formate jamais.
├── validations/                  # ★ Agent 0 — schémas Zod partagés client/serveur
│   ├── boosters.ts               #   OpenBoosterInput { theme_slug, idempotency_key: uuid v4 }
│   ├── cards.ts                  #   BurnInput, ApplyCosmeticInput, RerollCosmeticInput
│   ├── shop.ts                   #   BuyCosmeticInput
│   └── wishlist.ts               #   WishlistToggleInput
├── server/                       # ★ Agent A SEUL — tout ce qui tourne côté serveur
│   ├── supabase.ts               #   clients server (anon + service role, cookies)
│   ├── auth.ts                   #   requireUser() → 401 ; getSession()
│   ├── ratelimit.ts              #   token bucket mémoire par user ET par IP (interface
│   │                             #   swappable Upstash plus tard) : 1 open / 2 s
│   ├── logger.ts                 #   logger JSON structuré (request_id uuid propagé en header)
│   └── api-helpers.ts            #   wrapper handler : auth → Zod → rate limit → RPC →
│                                 #   mapping erreur Postgres → code métier → status HTTP
├── i18n/                         # ★ Agent B SEUL — config next-intl, routing, request.ts
│   ├── routing.ts                #   locales ['fr','en'], localePrefix 'always'
│   └── request.ts                #   getRequestConfig (messages par locale)
├── hooks/                        # ★ Agent B SEUL
│   ├── use-pwa.ts                #   isInstalled, canInstall, promptInstall, dismissed
│   └── use-booster-timer.ts      #   décompte smooth resync serveur (cosmétique UNIQUEMENT)
├── query/                        # ★ Agent B SEUL — client React Query (staleTime 30s)
│   └── client.ts
├── utils.ts                      # cn() et utilitaires divers — Agent B
└── pwa/                          # ★ Agent B SEUL — registration serwist (prod only) +
    └── register.ts               #   logique beforeinstallprompt
```

### 2.4 `types/`

```
types/
├── database.ts                   # ★ Agent 0 — types générés (`supabase gen types
│                                 #   typescript --local`). Aucun type DB inline ailleurs.
└── api.ts                        # ★ Agent 0 (évolutions : Agent A) — CONTRATS de réponse
                                  #   de chaque route : OpenBoosterResponse, BoosterStateResponse,
                                  #   CollectionPage, AlbumResponse, BurnResponse, QuestDto…
                                  #   A et B codent CONTRE ce fichier, jamais l'inverse.
```

### 2.5 `supabase/`

```
supabase/
├── schema.sql                    # ★ Agent 0 — schéma COMPLET : 12 tables (characters,
│                                 #   themes, profiles, user_cards, cosmetics, user_cosmetics,
│                                 #   wishlists, quests, user_quests, drops_log,
│                                 #   idempotency_keys, booster_openings) + contraintes
│                                 #   (unique(character_id, print_number), checks rareté/
│                                 #   source/type) + index (user_id+obtained_at,
│                                 #   character_id+base_rarity, themes GIN,
│                                 #   lower(name_romaji) trigram) + RLS deny-by-default
├── migrations/
│   └── 0001_functions.sql        # ★ Agent 0 — RPC SECURITY DEFINER : open_booster,
│                                 #   open_premium_booster, claim_daily_pack, burn_card,
│                                 #   update_quest_progress, claim_quests,
│                                 #   ensure_daily_quests, update_login_streak,
│                                 #   buy_cosmetic, apply_cosmetic, reroll_cosmetic,
│                                 #   toggle_wishlist. Idempotentes, commentaires
│                                 #   d'intention, pgcrypto, UNE transaction par appel.
├── seed.sql                      # ★ Agent 0 — 6 thèmes, ~15 cosmétiques, pool de quêtes
└── config.toml                   # timezone Europe/Paris, ports locaux — Agent 0
```

### 2.6 `pipeline/` — ★ Agent C SEUL

```
pipeline/
├── ingest.ts                     # orchestrateur (CLI : --resume, --dry-run, --limit, --anime)
├── anilist.ts                    # client GraphQL AniList (30 req/min, sans clé)
├── jikan.ts                      # client Jikan v4 (~60 req/min, fallback image, démos)
├── classify.ts                   # classification thèmes (pure, unit-testée)
├── db.ts                         # upsert characters (anilist_id unique → idempotent)
├── ratelimit.ts                  # rate limiter local + file d'attente (testé)
├── checkpoint.ts                 # checkpoint.json (curseur par source) → --resume sans doublon
├── report.ts                     # journal structuré par batch (fetched/inserted/skipped/excluded)
├── verify.ts                     # vérif : 0 doublon, images, ≥1 thème, distribution ±2 pts,
│                                 #   ≥300/thème → report.md
├── checkpoint.json               # généré au run (gitignored)
├── report.md                     # rapport final généré par verify.ts
└── README.md                     # relancer, --resume, ajouter un anime/thème, corriger un tag
```

### 2.7 `scripts/`

```
scripts/
├── dev-seed.ts                   # ★ Agent 0 — 2 users de test + quelques cartes (DEV LOCAL
│                                 #   uniquement, jamais en prod, documenté)
├── smoke-engine.ts               # ★ Agent A — 10 users virtuels en parallèle sur Supabase
│                                 #   local : prints distincts, compteurs ≥ 0, pity, doré,
│                                 #   idempotency ×3 → 1 débit. Tourne en CI.
└── sim-economy.ts                # ★ Agent E — 50 joueurs × 30 jours → report-economy.md
```

### 2.8 `messages/`, `assets/`, `public/`, racine

```
messages/
├── fr.json                       # ★ Agent B — 100 % des literals UI (zéro literal en dur)
└── en.json                       # ★ Agent B — parité stricte avec fr.json (testée par E)

assets/
└── prompts.md                    # ★ Agent D — prompts finaux IA (packs ×6, card-back) avec
                                  #   specs exactes (ratio, fond, style) si génération impossible

public/
├── manifest.webmanifest          # ★ Agent 0 — name/short_name "Manga Society", standalone,
│                                 #   icons 192/512/maskable, theme/background colors
├── icons/                        # ★ Agent 0 — icon-192.png, icon-512.png, maskable (placeholder OK)
├── packs/{theme}.png  ×6         # ★ Agent D — pack art par thème (ratio 3:4)
├── card-back.png                 # ★ Agent D — verso carte (seigaiha sombre, ratio 2.5:3.5)
└── sounds/                       # ★ Agent D — tear, flip, rare, epic, legendary, mythic,
                                  #   coin, click (.mp3 < 200KB, CC0)

.github/workflows/ci.yml          # ★ Agent 0 — lint → typecheck → build → supabase start →
                                  #   migrations → seed → tests. Rouge = pas de merge.
.env.example                      # ★ Agent 0 — toutes les variables documentées
next.config.ts                    # Agent B — images.remotePatterns (AniList/Jikan), headers
                                  #   de sécurité (spécifiés §8), i18n
middleware.ts                     # Agent B — routing next-intl + refresh session
```

---

## 3. Routes App Router — récapitulatif

| Route | Type | Propriétaire | Accès |
|---|---|---|---|
| `/` | page | B | public |
| `/login` | page | B | public |
| `/auth/callback` | route handler | B | public (code Supabase) |
| `/onboarding` | page | B | auth (choix username) |
| `/boosters` | page | B (+ `<BoosterOpening>` D) | auth |
| `/collection` | page | B | auth |
| `/shop` | page | B | auth |
| `/u/[username]` | page | B | public |
| `/offline` | page | B | public |
| `/mentions-legales`, `/cgu`, `/confidentialite` | pages | B | public |
| `/api/boosters/open` | POST | A | auth |
| `/api/boosters/open-premium` | POST | A | auth |
| `/api/boosters/daily` | POST | A | auth |
| `/api/boosters/state` | GET | A | auth (polling 30 s) |
| `/api/cards/burn` | POST | A | auth |
| `/api/cards/[id]` | GET | A | auth |
| `/api/cards/[id]/apply-cosmetic` | POST | A | auth |
| `/api/cards/[id]/reroll-cosmetic` | POST | A | auth |
| `/api/collection` | GET | A | auth (cursor pagination) |
| `/api/collection/album` | GET | A | auth |
| `/api/quests` | GET | A | auth |
| `/api/shop/buy` | POST | A | auth |
| `/api/wishlist` | GET | A | auth |
| `/api/wishlist/toggle` | POST | A | auth |
| `/api/themes/[slug]/pool-info` | GET | A | auth |
| `/api/me/login-streak` | POST | A | auth (idempotent) |

Toutes les mutations d'économie exigent un `idempotency_key` (uuid v4) généré **à chaque
tentative de clic** côté client, jamais par session.

---

## 4. Cartographie agent → fichiers

| Périmètre | Agent A (Backend Engine) | Agent B (UI Core) | Agent C (Data Pipeline) | Agent D (Juice) | Agent E (QA) |
|---|---|---|---|---|---|
| `app/api/**` | **ÉCRITURE** | lit `types/api.ts` | — | — | teste |
| `lib/server/**` | **ÉCRITURE** | — | — | — | — |
| `scripts/smoke-engine.ts` | **ÉCRITURE** | — | — | — | exécute en CI |
| `app/**` (pages, hors `/api`) | — | **ÉCRITURE** | — | ouvre des PR sur B (cf. D) | teste |
| `components/` hors `game-card/`, `booster-opening/`, `effects/` | — | **ÉCRITURE** | — | — | teste |
| `components/game-card/`, `booster-opening/`, `effects/` | — | refactor vers D via HANDOFF | — | **ÉCRITURE** | teste perf |
| `messages/fr.json`, `en.json` | — | **ÉCRITURE** | — | ajoute ses literals via HANDOFF → B | scan literals |
| `lib/i18n/`, `lib/hooks/`, `lib/query/`, `lib/pwa/` | — | **ÉCRITURE** | — | — | — |
| `middleware.ts`, `next.config.ts` | — | **ÉCRITURE** | — | — | propose headers via HANDOFF |
| `pipeline/**` | — | — | **ÉCRITURE** | — | — |
| `public/packs/`, `card-back.png`, `sounds/` | — | — | — | **ÉCRITURE** | vérifie poids |
| `assets/prompts.md` | — | — | — | **ÉCRITURE** | — |
| `tests/**`, `scripts/sim-economy.ts` | fournit fixtures | — | — | — | **ÉCRITURE** |
| `supabase/schema.sql`, `migrations/`, `seed.sql` | consomme (migration additive → `MIGRATIONS.md` si bug bloquant) | — | écrit via `db.ts` (upsert idempotent, jamais de DDL) | — | audit RLS |
| `lib/config.ts`, `lib/errors.ts`, `lib/validations/**`, `types/**` | lit | lit | lit | lit | lit |
| `docs/adr/**`, `SPEC.md`, `HANDOFF.md` | lit | lit | lit | lit | lit |

### Règles de frontière (non négociables)

1. **Disjointure stricte** : un fichier a exactement un propriétaire en écriture. Aucun agent
   ne modifie un fichier hors de son périmètre. Tout besoin de toucher au fichier d'un
   autre → entrée `HANDOFF.md` + PR séparée.
2. **Fichiers partagés en lecture seule** (`lib/config.ts`, `lib/errors.ts`,
   `lib/validations/`, `types/database.ts`) : si un code métier manque (code d'erreur,
   champ de validation), l'agent le signale dans `HANDOFF.md` — il ne le crée pas
   localement. Seul l'Agent 0 (ou un patch explicite validé) les étend.
3. **`types/api.ts`** : contrat A↔B. Écrit initialement par l'Agent 0, évolutions portées par
   l'Agent A, annoncées dans `HANDOFF.md`. L'Agent B code contre ce fichier et signale toute
   incohérence au lieu de contourner.
4. **Économie** : jamais de logique métier dans les handlers (au-delà de
   auth/validation/transport), jamais dans le client. Toute valeur d'équilibrage vient de
   `lib/config.ts` (côté client, affichage) ou des arguments SQL avec DEFAULT (côté serveur,
   vérité). Les poids/taux ne sont jamais exposés au client pour la mutation.
5. **Schéma BDD** : seul l'Agent 0 écrit le schéma. L'Agent A ne fait QUE des migrations
   additives documentées dans `MIGRATIONS.md` en cas de bug bloquant. L'Agent C n'écrit
   que des upserts idempotents (clé `anilist_id`).
6. **Agent D / rendu carte** : le rendu d'une carte existe uniquement dans
   `components/game-card/`. Si l'Agent B a rendu des cartes ailleurs, D refactorise et le
   note dans `HANDOFF.md` ; B review la PR.
7. **`middleware.ts`** : propriété de B (routing next-intl). A n'y met PAS de garde auth ;
   la protection se fait par `requireUser()` dans chaque handler.
8. **Sons/images d'assets** : 100 % locaux, produits par D. C ne hotlinke que les URLs
   AniList/Jikan en base. Aucun asset externe chargé au runtime.

---

## 5. Flux métier (séquences numérotées)

### 5.1 Ouverture de booster (idempotence bout en bout)

```
CLIENT (page /boosters)                         SERVEUR (route handler)                POSTGRES (RPC open_booster)
─────────────────────                           ───────────────────────                ─────────────────────────
1. Clic "Ouvrir"
2. Génère idempotency_key = uuid v4
   (NOUVELLE à chaque tentative, pas par session)
3. POST /api/boosters/open
   { theme_slug, idempotency_key }
        ────────────────────────────────►
                                                  4. requireUser() → 401 sinon
                                                  5. Zod(OpenBoosterInput) → 422 sinon
                                                  6. Rate limit (1 open / 2 s, user+IP)
                                                     → 429 'RATE_LIMITED'
                                                  7. INSERT idempotency_keys
                                                     ON CONFLICT (key) DO NOTHING
                                                     ──────────────────────────────►
                                                                                        8. CONFLIT → early return
                                                                                           result stocké (jsonb)
                                                                                           ★ idempotent : double-clic,
                                                                                           retry, refresh = sans effet
                                                  8b. Si conflit → retourne le résultat stocké
                                                  9. SINON, UNE transaction :
                                                                                       10. (a) recharge due : +1 par
                                                                                           tranche de 6 min depuis
                                                                                           last_booster_recharge, CAP 10
                                                                                           (la logique de recharge ne vit QUE là)
                                                                                       11. (b) pity_legendary++, pity_mythic++;
                                                                                           si pity_legendary ≥ 25 → garantit ≥1 L (reset 0)
                                                                                           si pity_mythic ≥ 200 → garantit ≥1 M (reset)
                                                                                       12. (c) doré : golden_counter ≥ 9 → is_golden
                                                                                           (taux ×2, reset 0) sinon ++
                                                                                       13. (d) booster_count > 0 sinon
                                                                                           RAISE 'NO_BOOSTER' ; décrémente
                                                                                       14. (e) roll 5 raretés pondérées
                                                                                           (args DEFAULT = config) ;
                                                                                           perso uniforme par tier DANS le thème
                                                                                       15. (f) par carte : UPDATE characters
                                                                                           SET print_count = print_count + 1
                                                                                           ... RETURNING print_count
                                                                                           ★ ATOMIQUE ; filet ultime :
                                                                                           unique(character_id, print_number)
                                                                                       16. (g) INSERT user_cards (first_owner=true),
                                                                                           cards_obtained_count++, premium_points
                                                                                           (+1/100), progression quêtes,
                                                                                           drops_log, booster_openings
                                                                                       17. (h) UPDATE idempotency_keys SET result
                                                                                  ◄────── 18. COMMIT (tout raise → rollback propre)
                                                  19. Mappe vers OpenBoosterResponse
                                                     (types/api.ts), status 200
        ◄──────────────────────────────── 20. 200 { cards[5], is_golden, pity_after… }
21. Monte <BoosterOpening cards isGolden>
    (données en props, aucun fetch dans la séquence)
```

### 5.2 Burn d'une carte

```
CLIENT                                   HANDLER                          RPC burn_card
1. Fiche carte → "Brûler"
2. Confirm modal (preview chakra
   = config côté client, indicative)
3. NOUVELLE idempotency_key + POST /api/cards/burn { card_id, idempotency_key }
        ──────────────────────────►   4. auth → Zod → rate limit
                                      5. idempotency ON CONFLICT (early return)
                                         ──────────────────────────────► 6. ownership check
                                                                            (user_cards.user_id = p_user)
                                                                            sinon RAISE 'NOT_OWNER'
                                                                         7. DELETE la carte
                                                                         8. chakra += burn[base_rarity]
                                                                            × (1 + min(wishlist_count/1000, 2))
                                                                         9. progression quêtes burn
                                                                        10. stocke { chakra_gained, new_balance }
                                     ◄────────────────────────────── 11. COMMIT
        ◄──────────────────────── 12. 200 { chakra_gained, new_balance }
13. Toast + resync React Query (pas d'optimistic UI)
```

### 5.3 Pack du jour

```
CLIENT                                HANDLER                        RPC claim_daily_pack
1. Widget /boosters (ou POST direct)
2. NOUVELLE idempotency_key + POST /api/boosters/daily
       ───────────────────────────►  3. auth → Zod → rate limit
                                    4. idempotency ON CONFLICT (early return)
                                       ───────────────────────────► 5. si daily_pack_claimed =
                                                                      (now() AT TIME ZONE 'Europe/Paris')::date
                                                                      → RAISE 'ALREADY_CLAIMED'
                                                                   6. thème du jour = rotation
                                                                      déterministe (sort_order,
                                                                      jours depuis epoch)
                                                                   7. 5 cartes rollées UNIQUEMENT
                                                                      E+ (poids renormalisés)
                                                                   8. gratuit (ni booster ni point),
                                                                      source 'daily', first_owner
                                                                   9. compte dans pity ET golden ;
                                                                      prints atomiques ; quêtes ;
                                                                      drops_log ; daily_pack_claimed =
                                                                      aujourd'hui
                                                                  10. stocke résultat
                                   ◄────────────────────────── 11. COMMIT
       ◄──────────────────────── 12. 200 { cards[5], theme_slug, next_reset_at }
                                   next_reset_at = minuit Europe/Paris (serveur)
13. Bouton grisé jusqu'à next_reset_at ; countdown affiché
```

### 5.4 Login streak

```
AUTH SUPABASE                          /auth/callback                        RPC update_login_streak
1. Magic link cliqué ou OAuth Discord
   (Discord = login UNIQUEMENT)
        ───────────────────────────► 2. Échange du code (route handler B)
                                     3. Création/refresh session cookie
                                     4. POST /api/me/login-streak
                                        ───────────────────────────► 5. si last_login_date =
                                                                           aujourd'hui (Europe/Paris) → noop
                                                                        6. si hier → login_streak++
                                                                           sinon → login_streak = 1
                                                                        7. si jour 7 → cosmétique streak
                                                                           (streak_reward, config)
                                                                           sinon chakra croissant par jour
                                                                        8. last_login_date = aujourd'hui
                                     ◄────────────────────────── 9. COMMIT (idempotent par construction)
```

### 5.5 Quêtes quotidiennes

```
PREMIÈRE ACTION DU JOUR (n'importe quelle RPC)        RPC ensure_daily_quests
                                                     1. si user_quests du jour (Europe/Paris)
                                                        existent déjà → noop
                                                     2. sinon : pioche 3 quêtes aléatoires
                                                        parmi le pool actif (quests.active)
                                                     3. INSERT user_quests (user_id, quest_id,
                                                        day = aujourd'hui, progress 0)

PROGRESSION (appelée au sein des transactions)       RPC update_quest_progress
open_booster / burn_card / claim_daily_pack …      4. progresse les quêtes du jour du type
                                                        concerné (progress += amount)
                                                     5. progress ≥ goal → completed = true

CLAIM (depuis /boosters ou /api/quests)            RPC claim_quests
6. Clic "Réclamer" → POST (idempotency_key)        7. pour chaque quête completed non claimed :
                                                        claimed = true, chakra += chakra_reward
8. Resync state                                    8. COMMIT
```

---

## 6. Politique service worker (PWA)

Recommandation : **`@serwist/next`** (intégration Next.js App Router, build du SW au build).

- **Precache** : le shell applicatif (pages statiques, CSS, JS, icônes, `card-back.png`,
  packs) via le precache manifest généré à chaque build.
- **Runtime cache** : les **images AniList/Jikan** (avatars/cartes) en
  **StaleWhileRevalidate** via `runtimeCaching`, avec **expiration 200 entrées**
  (ExpirationPlugin, maxEntries: 200) — la purge LRU évite de gonfler le cache.
- **Activation** : `skipWaiting` + `clientsClaim` (le nouveau SW prend le contrôle
  immédiatement, pas de double version pendant la navigation).
- **Registration** : **UNIQUEMENT en production** (`process.env.NODE_ENV === 'production'`,
  dans `lib/pwa/register.ts` appelé depuis un `useEffect` du root layout). Jamais en dev
  (cache fantômes lors du hot reload).
- **Navigation fallback** : toute navigation échouant en offline → la page dédiée
  `/offline` (pré-cachée), jamais la page d'erreur navigateur.
- **Manifest** (`public/manifest.webmanifest`) : name/short_name "Manga Society",
  `display: "standalone"`, `start_url: "/"`, `background_color`/`theme_color` du design
  system (dark), icônes 192, 512 et maskable (placeholder accepté en attendant l'asset final).
- **Bannière d'installation** (Agent B) : pilotée par `beforeinstallprompt`, dismissable
  (localStorage 7 jours), CTA iOS dédié (instructions add-to-homescreen, aucune API).

---

## 7. Politique temps réel

- Pas de WebSocket/Realtime gameplay en V1 : le client **polle**
  `GET /api/boosters/state` toutes les 30 s (React Query, staleTime 30 s). L'endpoint doit
  être solide sous 500 rps (un seul RPC ou vue SQL, aucun N+1).
- Toute invalidation après mutation se fait par `queryClient.invalidateQueries`, jamais
  par mutation locale de l'état économique.
- Le décompte de recharge/pity affiché entre deux polls est **cosmétique** (décompte smooth
  client) et se resynchronise au prochain state serveur. Source de vérité = serveur.

---

## 8. Sécurité, headers, environnements

- **Headers** (`next.config.ts`, Agent B) : `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP de base (audit E).
- **Secrets** : service role key UNIQUEMENT dans les route handlers (via `lib/server/`,
  jamais importé dans un fichier client). Aucun secret dans le client bundle — vérifié par
  `next build` + scan en CI.
- **RLS deny-by-default** sur TOUTES les tables : `profiles`, `user_cards`,
  `user_cosmetics`, `wishlists`, `user_quests` → `auth.uid() = user_id` ; `characters`,
  `themes`, `cosmetics`, `quests` → lecture publique ; `drops_log` → insert via RPC
  uniquement, aucune lecture utilisateur ; `idempotency_keys` → propriétaire uniquement.
- **Environnements** : Supabase LOCAL (`supabase start`) pour le dev et tous les tests —
  jamais la prod. Variables documentées dans `.env.example` (Supabase URL/anon/service
  role, Discord OAuth client id/secret, `NEXT_PUBLIC_SITE_URL`).
- **Dates serveur** : `NOW()` Postgres, resets quotidiens en timezone Europe/Paris
  (configurée au niveau DB ; sinon `(now() at time zone 'Europe/Paris')`), jamais l'horloge
  client.

---

## 9. Conventions git, branches, CI

- **Conventional commits** : `feat(scope): …`, `fix(scope): …`, `test(scope): …`,
  `docs(scope): …`, `refactor(scope): …`. Scope = le dossier périmètre (`api`, `boosters`,
  `collection`, `pipeline`, `game-card`, `opening`, `qa`…).
- **Branches** : un agent = une branche `agent/<scope>` (`agent/engine`, `agent/ui`,
  `agent/pipeline`, `agent/juice`, `agent/qa`). PR vers `main`, CI verte obligatoire,
  jamais de merge à CI rouge, jamais de push direct sur `main`.
- **CI** (`.github/workflows/ci.yml`, Agent 0) : `lint` → `typecheck` → `build` →
  `supabase start` → migrations → seed → tests (smoke-engine + tests agents). Rouge = bloquant.
- **Perf budgets** (vérifiés en CI/review) : first-load JS < 200 KB gzip par route publique ;
  LCP < 2,5 s en 4G simulée ; animations uniquement transform/opacity ;
  `prefers-reduced-motion` respecté partout.
- **Standards code** : TS strict + `noUncheckedIndexedAccess`, zéro `any`
  (`no-explicit-any` / `no-unsafe-*` en erreur), types DB depuis `types/database.ts`,
  zéro literal UI (next-intl), schémas Zod partagés dans `lib/validations/`,
  erreurs = `{ error: CODE_METIER }` (le client traduit via `messages/`).

---

## 10. Ordre d'exécution des agents

1. **Agent 0 (ce document)** — fondations. Vérification avant lancement de la suite :
   contrainte `unique(character_id, print_number)`, table `idempotency_keys`, RLS
   deny-by-default, CI fonctionnelle sur un commit trivial.
2. **A + B + C en parallèle** (3 sessions distinctes). A et B se contractent via
   `types/api.ts` ; tout écart → `HANDOFF.md`. C est indépendant (n'attend que le schéma).
3. **D + E en parallèle.** D démarre dès que le placeholder de B existe (la page
   `/boosters` doit monter `<BoosterOpening cards isGolden onComplete>` avec un
   placeholder propre listant les 5 cartes en attendant la séquence finale) ;
   E attend A stable.

---

## 11. Anti-patterns à surveiller en review (P0 → P2)

| Gravité | Anti-pattern |
|---|---|
| P0 | Logique d'économie côté client ; print non atomique ; pity/idempotence contournées ; update direct BDD hors RPC |
| P0 | `unique(character_id, print_number)` absente ou contournée ; RLS trouée |
| — | `any` / types DB inline dupliqués → refus de review |
| P1 | Optimistic UI sur une action économique (burn, achat, ouverture) |
| P1 | `idempotency_key` réutilisée par session au lieu d'être régénérée à chaque clic |
| P2 | Literals non traduits ; déluge de néon (design) ; stack trace/message SQL au client |

---

*Document maintenu par l'Agent Architecte. Toute décision divergente prise en cours de
route doit être tracée dans un ADR (`docs/adr/`) et annoncée dans `HANDOFF.md`.*
