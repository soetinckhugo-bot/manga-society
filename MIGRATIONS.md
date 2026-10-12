# MIGRATIONS — Journal des migrations ADDITIVES (Agent A)

> Seul l'Agent 0 écrit le schéma de base (migrations 0000–0002). L'Agent A
> n'a le droit que de **migrations additives**, documentées ici, en cas de bug
> bloquant (SPEC §4, règle 5). Aucune modification des migrations existantes.

## 0003_read_rpcs.sql — RPC de lecture pour les endpoints GET (Agent A)

**Motif (bug bloquant pour le périmètre Agent A)** : la migration 0001 n'expose
que des fonctions de **mutation**. Or les endpoints de lecture exigés par
`SPEC.md` (§2.1, §3) ne peuvent pas être implémentés comme une "couche mince"
sans violer deux règles non négociables :

- « Pas de N+1 : tout agrégat en une requête (vues SQL ou RPC) »
  (PROMPT A, contraintes) — ex. `owners_count` (count distinct sur
  `user_cards`, table en RLS propriétaire) et l'album (silhouettes + compteurs
  par perso) sont inaccessibles ou coûteux en requêtes clientes ;
- « La logique de recharge ne vit QUE dans la RPC » / aucune logique métier
  dans les handlers — ex. `pity_legendary_left`, la rotation déterministe du
  pack du jour et `next_reset_at` (minuit Europe/Paris, DST incluse) ne
  doivent pas être recalculés en TypeScript.

**Contenu (additif, aucune table modifiée)** :

| Fonction | Endpoint | Rôle |
|---|---|---|
| `get_booster_state(uuid)` | GET /api/boosters/state | État du panneau en 1 appel (stock, recharge, pity restants, doré, daily pack, widget quêtes, streak) |
| `get_collection_page(uuid, jsonb, int, text, text, text, text)` | GET /api/collection | Pagination par curseur opaque, filtres thème/rareté/recherche (trigram) et 4 tris côté SQL |
| `get_album(uuid)` | GET /api/collection/album | Silhouettes groupées par anime (parcours unique de `characters`) |
| `get_card_detail(uuid, uuid)` | GET /api/cards/:id | CardDto complet + `owners_count` (count distinct) ; `CARD_NOT_FOUND` si non possédée |
| `get_daily_quests(uuid)` | GET /api/quests | 3 quêtes du jour (génère si première action) + `next_reset_at` |
| `get_wishlist(uuid)` | GET /api/wishlist | Wishlist + slots |
| `get_theme_pool_info(uuid, text)` | GET /api/themes/:slug/pool-info | Pool par rareté + envies du joueur présentes ; `THEME_NOT_FOUND` |
| `get_next_reset_at()` | POST /api/boosters/daily | Minuit Europe/Paris suivant (réponse `next_reset_at` serveur) |

Conventions respectées : `SECURITY DEFINER` + `SET search_path = public`,
EXECUTE révoqué à PUBLIC/anon, accordé à `authenticated` + `service_role`
(identique à 0001). Valeurs d'équilibrage (pity 25/200, stock 10, recharge
6 min, doré 10, wishlist 10 slots) dupliquées comme littéraux documentés —
duplication serveur autorisée, source de vérité = `lib/config.ts`.

**Application** : `supabase db reset` (local) / `supabase db push` (cloud) —
la migration part dans l'ordre après 0002. À faire valider par l'Agent 0 en
review (fichier `supabase/migrations/`, hors périmètre d'écriture A, ajout
additif autorisé par SPEC §4 règle 5).

## 0004_fix_premium_booster.sql — Correctif économie du booster premium (Agent A)

**Motif (bug bloquant d'économie)** : l'implémentation 0001 d'`open_premium_booster`
accordait **5 cartes** par ouverture premium (4 rolls à poids complets + slot
garanti), alors que la règle produit verrouillée est : 10 points premium =
**1 carte** avec Légendaire minimum (roll interne pondéré 85 % L / 15 % M —
`lib/config.ts` `premium.minRarity`/`premium.weights` ; PROMPT 0 §2 « 1 carte
Légendaire minimum »). L'écart gonflait l'obtention de cartes ×5.

**Correction (`create or replace`, signature inchangée `(uuid, uuid, jsonb,
numeric)` → les grants EXECUTE de 0001 restent valides, reaffirmés en fin de
fichier)** :

- débit des 10 points AVANT tout effet (`NOT_ENOUGH_POINTS` sinon, inchangé) ;
- **une seule carte** : priorité pity M > pity L > roll 85/15 — le M satisfait
  aussi la garantie L ; la carte ne descend jamais sous Légendaire ;
- l'ouverture compte toujours dans le pity ET le doré (SPEC §1) ;
- idempotence par clé inchangée : les anciens résultats 5-cartes déjà stockés
  restent rejoués tels quels (résultat stocké, aucun nouvel effet) ;
- quêtes (`open_boosters`) et historique (`booster_openings`) conservés ;
- `p_weights` devient inutilisé (aucun roll à poids complets) : conservé dans
  la signature pour ne pas casser les grants, ignoré silencieusement.

**Réalignements côté code (Agent A)** : `types/api.ts`
(`OpenPremiumBoosterResponse.card` au singulier), `lib/server/dto.ts`
(schema `.length(1)`, mapper retournant `card`), route
`app/api/boosters/open-premium/route.ts`, et le scénario premium du smoke
test (`scripts/smoke-engine.test.ts` : 1 carte L/M au lieu de 5 avec slot).

**Point de vigilance** : le commentaire de `lib/config.ts` (ligne 51,
« Nombre de cartes par ouverture de booster (gratuit, premium et daily) »)
mentionne encore le premium dans `cardsPerBooster: 5` — commentaire à jour
par l'Agent 0 (`cardsPerBooster` ne s'applique plus au premium).

## 0005_fix_next_reset_at.sql — Correctif calcul du prochain minuit Paris (Agent A)

**Motif (bug de calcul de date)** : `_next_paris_midnight` (0003) appliquait
`at time zone 'Europe/Paris'` à une valeur `date`. Le cast implicite
date → timestamp/timestamptz est résolu différemment selon la version Postgres
et le fuseau de session (prouvé empiriquement : minuit UTC sur PG embarqué,
« wall time Paris re-étiquetée UTC » sur le cloud PG 15 — décalage de +2 h
été / +1 h hiver). Constats à 2026-10-11 20:23 UTC : attendu
`2026-10-11T22:00Z`, cloud renvoyé `2026-10-12T02:00Z`.

**Correction** : cast EXPLICITE en `timestamp without time zone` avant
`at time zone` — variante documentée « heure murale interprétée dans la zone »,
produisant l'instant UTC exact du prochain minuit Europe/Paris (22:00Z été,
23:00Z hiver — vérifié des deux côtés sur Postgres embarqué, puis re-vérifié
sur le cloud après push : exact).

**Impact** : `next_reset_at` affiché (booster state, quêtes, POST daily pack).
La logique de claim (comparaison de dates via `_paris_today`, date pure) n'était
PAS affectée. `create or replace` du helper, revoke EXECUTE reaffirmé.

## 0007_profile_rpcs.sql — RPC profil public + username + vitrine (Agent A)

**Motif (intégration Agent B, bloquante)** : onboarding (choix du username,
dispo temps réel) et page publique `/u/[username]` (SPEC §3) sans support
serveur : `profiles`/`user_cards`/`wishlists` sont en RLS propriétaire, et
aucune colonne ne stockait la vitrine.

**Contenu (additif)** :

| Fonction | Endpoint | Accès |
|---|---|---|
| `check_username(text)` | GET /api/profiles/check-username | public (anon) |
| `set_username(uuid, text)` | POST /api/profiles/username | auth |
| `set_showcase(uuid, uuid[])` | POST /api/me/showcase | auth |
| `get_public_profile(text)` | GET /api/u/[username] | public (anon) |

Plus `alter table profiles add column showcase_card_ids uuid[]` (≤ 5 cartes,
ordre = position ; sans FK volontairement — une carte brûlée disparaît de la
vitrine au prochain set_showcase).

Conventions : `SECURITY DEFINER` + `SET search_path = public`, EXECUTE révoqué
à PUBLIC/anon puis accordé explicitement (les lectures publiques à anon —
données publiques par design). Codes RPC : `USERNAME_TAKEN` (unique citext,
catch `unique_violation`), `INVALID_USERNAME` (regex `^[a-z0-9_-]{3,20}$`,
duplication serveur documentée du pattern client), `PROFILE_NOT_FOUND`,
`CARD_NOT_FOUND` / `NOT_OWNER` (vitrine), `VALIDATION_ERROR` (> 5, filet).

**Note numérotation** : 0006 = `service_role_grants.sql` (Agent 0, grants
characters). Ce fichier a été renommé 0007 pour préserver l'ordre.

**À valider par l'Agent 0** : ajout du code `'PROFILE_NOT_FOUND'` (404) dans
`lib/errors.ts` (ordre utilisateur direct — le code manquait pour un 404 propre
des profils publics ; tous les endpoints existants bénéficient du mapping
`PROFILE_NOT_FOUND` au lieu d'un conservateur 500).

## 0006_service_role_grants.sql — Grant service_role sur characters (Agent C)

**Motif (bug bloquant pour le périmètre Agent C)** : `0000_schema` révoque tout
de `anon`/`authenticated` puis re-grante uniquement le nécessaire à ces deux
rôles. Le rôle Postgres `service_role` (clé service du pipeline et des route
handlers) n'avait donc **aucun grant** sur `characters` → `permission denied`
(42501) à l'upsert, seed impossible. Les RPC 0001/0003 n'étaient pas impactées
(`SECURITY DEFINER` = owner). Note : un `0004_service_role_grants.sql` a d'abord
été tenté puis renommé — `0004` était déjà pris par `0004_fix_premium_booster`
(Agent A), poussé sur le cloud entre-temps.

**Contenu (additif, minimal)** :
`grant select, insert, update on public.characters to service_role;`
Uniquement ce que le pipeline écrit (upsert idempotent sur `anilist_id` +
recalcul des raretés). Aucune colonne économique ouverte : `print_count` /
`wishlist_count` restent mutés UNIQUEMENT par les RPC.

**Application** : `supabase db push` (cloud, projet lié). À faire valider par
l'Agent 0 en review.


## 0008_hotfix_preprod.sql — Hotfix pré-prod groupé : sécurité RPC + économie + cloud + CI (Agent 0)

**Motif (blocage de déploiement V1)** : l'audit QA d'E (41 tests, cf.
`QA_REPORT.md` + addendum Agent 0) a établi un trou P0 (aucune garde
`auth.uid()` sur les RPC `p_user`) et 5 P1/P2 (cap wishlist absent, drift
streak vs `lib/config.ts`, double débit cosmétique, `get_public_profile` planté,
grants service_role incomplets). De plus, deux bugs pré-existants 0001 n'ont
été exécutés pour la première fois qu'avec ces tests (jamais de run DB avant la
CI, pas de Docker chez E) : vol de booster par `due` négatif et `burn_card`
cassé (alias `c.base_rarity` sur `user_cards`).

**Contenu (additif strict, 0001 jamais éditée en place ; commentaires
d'intention ; valeurs d'équilibrage UNIQUEMENT en paramètres SQL DEFAULT
alignés sur `lib/config.ts`)** :

1. **Garde E-01** : helper `_assert_self(uuid)`
   (`if auth.uid() is not null and p_user <> auth.uid() then raise 'FORBIDDEN'`)
   en tête des 21 RPC publiques prenant `p_user` (12×0001 + 7×0003 +
   `set_username`/`set_showcase`). `auth.uid() is null` ⇒ service_role,
   smoke engine et simulations passent. `_lock_characters_sorted(uuid[])`
   (verrouillage trié anti-deadlock AB-BA sur `characters`).
2. **Verrou de tête `profiles … for update` AVANT `_idempotency_begin`** dans
   toutes les mutations (anti-deadlock 40P01 : la FK `idempotency_keys →
   profiles` prend un KEY SHARE incompatible avec le FOR UPDATE de la
   recharge — trou pré-existant 0001, mortel sous ≥ 15 appels parallèles).
3. **E-02** `toggle_wishlist` : `p_max_slots int default 10`, cap réel,
   `WISHLIST_FULL` avant toute écriture, toggle off toujours permis.
   **E-03** `update_login_streak` : `p_chakra_by_day int[] default
   '{20,25,30,40,50,65,0}'` + `p_cosmetic_reward_day int default 7` (plateau
   `least(streak, jour-1)`). **E-04** `buy_cosmetic` : `ALREADY_OWNED` avant
   débit + lock advisory ; `reroll_cosmetic` : `EMPTY_POOL` avant débit +
   exclusion de l'inventaire. **E-05** `claim_daily_pack` progresse
   `obtain_epic_plus`. **E-07** `get_public_profile` : jointure
   `characters.base_rarity`. `drop function` des anciennes signatures non
   gardées (`toggle_wishlist(uuid,uuid)`, `update_login_streak(uuid)`).
4. **Fix `due` négatif** (vol de booster, pré-existant 0001) :
   `greatest(0, floor(extract(epoch from (now() - last_booster_recharge)) /
   360.0))` — `now()` figé par transaction peut être antérieur au
   `last_booster_recharge` posé par une recharge concurrente → `floor = -1`
   volait un booster et reculait l'horodatage de 6 min (1 `NO_BOOSTER`
   aléatoire sous 10 opens parallèles à stock pile).
5. **Fix `burn_card`** (cassé depuis 0001) : `ch.base_rarity` (la rareté vit
   sur `characters` ; l'alias 0001 levait 42703 à chaque appel).
6. **E-08** : grants TABLE service_role minimal, recensé depuis les scripts
   (`profiles` S/I/U, `characters` +DELETE — purge physique des fixtures QA
   validée par l'orchestrateur, `themes` S/I/U/D, `user_quests` S/I/U/D,
   SELECT `user_cards`/`wishlists`/`user_cosmetics`/`cosmetics`/`quests`/
   `drops_log`). Aucune économie ouverte en écriture hors RPC.
7. **CI** : `npm run test` ajouté au job supabase (vraie clé anon locale
   extraite de `supabase status` pour les sign-ins RLS).

**Application** : `supabase db push` (cloud) après `migration repair
--status reverted 0008` (deux amendements itératifs — le fichier local est la
vérité, le cloud a été ramené à l'identique ; `migration list` = 0000→0008
aligné des deux côtés).

**Vérifié sur le cloud** (juge complet = CI locale, ces tests n'ayant jamais
tourné sous Docker) : concurrence 4/4 ×2, rls-audit 17/17 (attaque d'E
rejouée — 16 RPC cross-user `FORBIDDEN`, état de B inchangé),
economy.business 14/14, rng.property + config-drift 33/33. Détail et
justifications des corrections de tests dans `QA_REPORT.md` (addendum Agent 0).

## 0009_booster_mix.sql — Booster MIX : thème virtuel « pool complet » (Agent 0)

**Motif (décision produit V1 verrouillée par l'orchestrateur, E-06)** : les
persos untagged (`themes = {}`, **1 647 en prod**) sont intirables par les 6
thèmes taggés. Le thème `mix` ouvre le booster sur la totalité du pool, sans
filtre thème — seul moyen de les obtenir.

**Contenu (additif, aucune valeur d'équilibrage touchée)** :

1. upsert `themes` : `('mix', 'Tous les persos', 'All characters',
   max(sort_order)+1)` — dernier de la rotation journalière.
2. `_pick_character` : prédicat `(slug = 'mix' or slug = any(themes))`.
   Central volontairement : `open_booster`, `open_premium_booster` et
   `claim_daily_pack` en héritent. `INVALID_THEME` inchangé (tout slug
   inconnu — dont les 6 thèmes mal orthographiés — toujours refusé ; 'mix'
   est désormais un slug connu). Effet de bord assumé : le daily pack de
   rotation tombe sur le pool complet 1 jour sur 7.
3. `get_theme_pool_info` : même prédicat sur total / by_rarity /
   wishlist_matches — `/api/themes/mix/pool-info` reflète le pool réel.

**Application** : `supabase db push` — cloud **0000→0009 aligné** des deux
côtés (`migration list`).

**Vérifié live sur le cloud** : `get_theme_pool_info('mix')` →
`total_characters = 5 000` = 3 353 taggés + **1 647 untagged** (recomptés par
requête REST indépendante) ; slug inconnu → `THEME_NOT_FOUND`. Test
économique `economy.business.test.ts` (« booster mix : untagged présent dans
le pool complet ») : pool-info exact vs requête directe, ouverture `mix` à
poids forcé, `INVALID_THEME` sur slug inconnu — juge complet = CI.
