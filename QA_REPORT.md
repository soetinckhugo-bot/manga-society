# QA_REPORT — Agent E (QA & Économie)

> Périmètre : PROMPT E §5. Méthode : property tests RNG (fast-check), tests métier
> et de concurrence (vitest + Supabase **local**, exécutés en CI), audit RLS
> (Supabase **cloud**, 2 users de test, données nettoyées après — voir Limites),
> simulation économique 50 joueurs × 30 jours, vérifications produit (grep).
> **Agent E ne réécrit pas les features** : chaque trou ci-dessous est reproduit
> par un test (`it.fails`) qui passe au rouge dès que le propriétaire corrige.
>
> Références : `report-economy.md`, `ECONOMY_PATCH.md` (leviers chiffrés L1–L5).

## Verdict global

| Niveau | Count | Détails |
|---|---:|---|
| P0 | 1 | E-01 |
| P1 | 5 | E-02, E-03, E-04, E-07, E-08 |
| P2 | 5 | E-05, E-06, E-09, E-10, économie (puits) |

Le socle est sain (RNG, RLS tables, auth routes, idempotence, i18n — voir fin).
Les trous sont concentrés sur deux axes : **la couche RPC** (autorisation d'acteur,
caps métier, cohérence config) et **la cohérence cloud/local** (E-08, E-07).

### Registre des P0/P1 — owner et fichier racine présumé

Ces trous ne sont pas réparés par E (PROMPT E : « tu ne réécris pas les features »).
Chaque entrée désigne le propriétaire en écriture (standard n°1 de la SPEC) et le
fichier où le fix doit vivre — **hotfix groupé attendu côté Agent 0 (migration 0008)**.

| ID | Gravité | Owner | Fichier racine présumé |
|---|---|---|---|
| E-01 | P0 | Agent 0 | `supabase/migrations/0001_functions.sql` — garde `auth.uid()` en tête de **chaque** RPC publique (fix transversal, une seule migration) |
| E-02 | P1 | Agent 0 | `supabase/migrations/0001_functions.sql:1248` — `toggle_wishlist` (le cap 10 n'existe que dans `lib/config.ts` + les literals i18n) |
| E-03 | P1 | Agent 0 | `supabase/migrations/0001_functions.sql` — fonction de streak (trigger login) à aligner sur `lib/config.ts` `streak.chakraByDay` (source de vérité, standard n°12) |
| E-04 | P1 | Agent 0 | `supabase/migrations/0001_functions.sql:1025` — `buy_cosmetic` (vérifier l'ownership avant le débit ou restaurer sur conflit) |
| E-07 | P1 | Agent 0 | `supabase/migrations/0007_profile_rpcs.sql` — `get_public_profile` (joindre `characters.base_rarity` au lieu de `uc.rarity`) |
| E-08 | P1 | Agent 0 | `supabase/migrations/0006_service_role_grants.sql` — grants service_role explicités table par table (bloque aussi la purge des fixtures, voir Limites) |

Les `it.fails` des tests E passent au rouge quand le fix correspondant est déployé :
c'est le signal de « trou comblé », à basculer en assertion normale par le
propriétaire du fix (pas en les supprimant).

---

## P0

### E-01 — Aucune RPC ne vérifie que `p_user = auth.uid()` (privilège complet inter-comptes)

- **Gravité** : P0 — sécurité. N'importe quel joueur authentifié agit sur le compte
  de n'importe quel autre joueur en passant son UUID.
- **Preuve** (exécutée sur le cloud, users de test A et B, cf. `scripts/audit-cloud.ts`) :
  A a appelé `open_booster(p_user := B)` → le stock de B a été débité (10 → 9) ;
  A a consommé le daily pack de B ; A a pollué la wishlist de B (`toggle_wishlist`) ;
  A a renommé le profil de B ; A a acheté un cosmétique débitant le chakra de B.
  Les policies RLS des tables sont correctes (isolation 16/16, cf. section « Sain »)
  — le trou est intégralement dans la couche RPC `security definer`.
- **Fix suggéré** (par Agent A) : garde en tête de chaque RPC —
  `if auth.uid() is not null and p_user <> auth.uid() then raise exception 'FORBIDDEN'; end if;`
  (`auth.uid() is null` pour préserver les appels service_role des scripts).
- **Propriétaire** : Agent 0 (migrations RPC). **Test** : `tests/rls-audit.test.ts`
  (16/16 — inclut les readbacks cross-user), preuves complémentaires dans `scripts/audit-cloud.ts`.

## P1

### E-02 — Le cap wishlist (10) n'existe pas : `toggle_wishlist` n'atteint jamais `WISHLIST_FULL`

- **Preuve** : SPEC §wishlist (10 slots max) ; le literal `WISHLIST_FULL` existe dans
  `lib/errors.ts` + `messages/fr.json` + `messages/en.json` mais dans aucune migration.
  Sur cloud : 12 entrées acceptées sans erreur. Test : `tests/economy.business.test.ts`
  → `it.fails` « refuse la 11e entrée ».
- **Propriétaire** : Agent 0 (RPC `toggle_wishlist`).

### E-03 — Streak SQL ≠ `lib/config.ts` (violation du standard n°12 : la config est la source de vérité)

- **Preuve** : migration 0001 paie `least(streak,10)*5` (J1 = 5, J7 = 0 cosmétique,
  plafond 50/j) ; `GAME_CONFIG.streak.chakraByDay` promet `[20,25,30,40,50,65,0]`.
  J1 mesuré en live = 5 chakra. Test : `tests/config-drift.test.ts` → `it.fails`.
  Impact économique chiffré : variante `streak-config` (ECONOMY_PATCH L2).
- **Propriétaire** : Agent 0 (aligner la fonction SQL sur la config, dans un sens à trancher).

### E-04 — Rachat d'un cosmétique déjà possédé = double débit silencieux

- **Preuve** : la RPC débite le chakra puis `insert … on conflict do nothing` (l'insert
  échoue silencieusement, le débit est conservé). Test : `tests/economy.business.test.ts`
  → `it.fails` « double achat = 1 seul débit ».
- **Propriétaire** : Agent 0 (RPC d'achat) — vérifier l'ownership AVANT le débit
  ou restaurer le chakra sur conflit.

### E-07 — `get_public_profile` (migration 0007) plante sur tout joueur possédant des cartes

- **Preuve** : erreur `column uc.rarity does not exist` — la rareté vit sur
  `characters.base_rarity`, pas sur `user_cards`. La page publique `/u/[username]`
  est donc cassée dès qu'un joueur a des cartes ; A n'avait couvert que le 404.
  Test : `scripts/rls-audit` → `it.fails` « get_public_profile ».
- **Propriétaire** : Agent 0 (migration corrective 0007+).

### E-08 — Grants service_role incomplets sur le cloud : les scripts hors RPC cassent en prod (CI localement verte)

- **Preuve** : sur le cloud, le service_role n'a de grant que sur `characters` (0006) ;
  `SELECT`/`UPDATE` sur `profiles` = `permission denied`. La stack locale
  (`supabase start`) donne tout au service_role, d'où la CI verte malgré le trou.
  Conséquences observées : `scripts/dev-seed.ts` et le refill du smoke engine
  refusés sur cloud ; des compteurs du probe lus `null` (déni de grant, pas un
  seed manquant — cosmetics 16, quests 7 bien présents).
- **Propriétaire** : Agent 0 (migration de grants, à calibrer : le service_role ne
  devrait avoir QUE les grants dont les scripts ont besoin, explicitement listés).

## P2

### E-05 — Le daily pack ne progresse pas la quête `obtain_epic_plus`

- **Preuve** : `claim_daily_pack` progresse `claim_daily_pack` mais pas
  `obtain_epic_plus`, alors que ses 5 cartes sont Épique+. Test :
  `tests/economy.business.test.ts` → `it.fails`. (Décision design à confirmer —
  si c'est voulu, retirer le `it.fails`.)
- **Propriétaire** : Agent 0.

### E-06 — Booster MIX non câblé (décision V1 du HANDOFF C toujours en suspens)

- **Preuve** : ni thème `mix` au seed, ni branche dans `open_booster`. D a l'asset
  `mix.png` prêt et documente le besoin côté ouverture. Tests :
  `tests/config-drift.test.ts` → `it.fails` « thème mix ».
- **Propriétaire** : Agent 0 (seed + RPC) ; intégration D déjà prête.

### E-09 — Le CSP servi en production contient `'unsafe-eval'` et `'unsafe-inline'` (script-src)

- **Preuve** : `next.config.ts` `headers()` applique le **même** CSP en dev et en prod ;
  le commentaire du fichier prétend que « l'app reste 100 % 'self' en prod » — c'est
  faux. `'unsafe-eval'` n'est justifié que par le HMR turbopack (dev).
- **Fix suggéré** : CSP strict en prod (`script-src 'self'`), variante assouplie en dev
  via `process.env.NODE_ENV`. Fichier propriété de B — audit uniquement, pas de patch.
- **Propriétaire** : Agent B (`next.config.ts`, SPEC §8).

### E-10 — Variables Discord fantômes dans `.env.example`

- **Preuve** : `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`
  ne sont référencées **nulle part** dans le code (OAuth géré côté Supabase) ;
  `DISCORD_REDIRECT_URI` pointe vers `/api/auth/callback/discord`, route inexistante
  — le vrai callback est `/{locale}/auth/callback`. Documente un faux contrat.
- **Propriétaire** : Agent B (ou 0) — supprimer ou corriger les trois variables.

### Économie — pas de puits récurrent après ~J26 (verdicts L1–L5)

Constats et leviers chiffrés dans **ECONOMY_PATCH.md** (stock J30 ≈ 6 077 et
+~600/j sans sortie ; daily pack = 48 % des L ; multiplicateur wishlist
inflationniste ×2,8). Décision design requise — hors gravité de code.

---

## Ce qui est sain (vérifié, avec preuves exécutables)

| Domaine | Résultat | Preuve |
|---|---|---|
| RNG `_roll_rarity` | 100k rolls à ±0,3 pt des poids (booster/doré/daily/premium) ; chi² d'uniformité sur `_pick_character` (pools 2→1 000) | `tests/rng.property.test.ts` |
| Drift config/SQL | poids somme 100, pity 25/200, doré 9→reset, recharge 6 min cap 10, table burn, premium 85/15, seuils print | `tests/config-drift.test.ts` |
| RLS (tables) | isolation utilisateur 16/16, table par table | `tests/rls-audit.test.ts` (cloud, exécuté) |
| Auth des routes API | `handleApi` requis par défaut, 2 routes publiques explicites, `requireUser` côté handler (SPEC règle 7) | grep `app/api/**` + `lib/server/api-helpers.ts:193` |
| Concurrence | même clé ×5 = 1 débit ; pool d'1 perso = 200 prints distincts ; recharge jamais < 0 ; burn pendant ouvertures parallèles | `tests/concurrency.test.ts` (CI) |
| Métier | daily 1/j strict, quêtes idempotentes, points premium aux frontières 99→104 et 195→200, reset doré cross-type | `tests/economy.business.test.ts` (CI) |
| i18n erreurs | `WISHLIST_FULL`, `INSUFFICIENT_CHAKRA` présents fr + en | `messages/*.json` |
| Suite locale | `npm run test` : 60 passed / 41 skipped / 0 failed ; `tsc` + `eslint` propres | commandes du repo |

## Limites de cette passe

- Les tests DB (`economy.business`, `concurrency`) n'ont **pas** pu être exécutés
  sur ce poste (pas de Docker → pas de Supabase local). Ils sont écrits pour la CI
  locale (même pattern que le smoke engine de A) et devront faire tourner leur
  premier run là-bas. Leur garde refuse tout run contre le cloud.
- L'audit cloud a laissé 72 personnages de fixture (anilist_id 9 200 000+)
  **neutralisés** (`themes = []`, hors pool de tirage) mais non supprimés — la
  migration 0006 ne grante pas `DELETE` sur `characters` au service_role (cf. E-08).
  Purge physique à trancher par Agent 0.
- Les 2 users de test ont été supprimés (`scripts/purge-cloud-fixtures.ts`) ;
  relancé en fin de passe pour confirmer le nettoyage.


---

# ADDENDUM — Hotfix pré-prod Agent 0 (migration 0008 + cloud + CI)

> Statut au **12 oct. 2026** : migration `0008_hotfix_preprod.sql` appliquée au
> cloud (repair/re-push documenté dans HANDOFF), `supabase migration list
> --linked` = **0000 → 0008 aligné local/cloud**, purge physique des 72
> fixtures exécutée (**fixtures restantes : 0 / 5 000 persos**, 0 user QA
> résiduel), CI enrichie (`npm run test` dans le job supabase + vraie clé anon
> locale pour les sign-ins RLS). Verdicts d'E mis à jour ci-dessous — les
> entrées originales d'E sont conservées telles quelles au-dessus.

## Verdicts E mis à jour

| ID | Verdict Agent 0 | Preuve (exécutée) |
|---|---|---|
| E-01 (P0) | **Corrigé (0008)** | Garde `_assert_self` (`if auth.uid() is not null and p_user <> auth.uid() then raise 'FORBIDDEN'`) en tête des **21 RPC** (12×0001 + 7×0003 + `set_username`/`set_showcase`/`get_public_profile` — cette dernière sans `p_user`, auditée séparément) ; service_role passe (`auth.uid()` null). `tests/rls-audit.test.ts` **17/17 vert sur le cloud** : scénario d'attaque d'E rejoué (A agit au nom de B sur 16 RPC cross-user) → 16× `FORBIDDEN`, état de B **inchangé** (snapshot avant/après), aucune écriture. |
| E-02 (P1) | **Corrigé (0008)** | `toggle_wishlist` gagne `p_max_slots int default 10` : cap réel, `WISHLIST_FULL` levé **avant** toute écriture (rollback propre), toggle off du dernier slot toujours permis. `economy.business.test.ts` 14/14 vert cloud. |
| E-03 (P1) | **Corrigé (0008)** | `update_login_streak` gagne `p_chakra_by_day int[] default '{20,25,30,40,50,65,0}'` + `p_cosmetic_reward_day int default 7`, plateau `least(streak, v_cosmetic_day-1)` — valeurs alignées sur `lib/config.ts` (`streak.chakraByDay`, standard n°12, aucune valeur en dur ailleurs). `config-drift.test.ts` 18/18 vert cloud. |
| E-04 (P1) | **Corrigé (0008)** | `buy_cosmetic` lève `ALREADY_OWNED` (409, ajouté à `lib/errors.ts` + i18n fr/en) **avant** le débit + verrou advisory par item. Test « double achat = 1 seul débit » 14/14. |
| E-05 (P2) | **Corrigé (0008)** | `claim_daily_pack` progresse `obtain_epic_plus` (le pack roll uniquement des tiers Épique+, cohérent avec `open_booster`). |
| E-07 (P1) | **Corrigé (0008)** | `get_public_profile` recrée la jointure sur `characters.base_rarity` (fin de `uc.rarity`). Couvert par le test E-07 basculé en assertion normale, 17/17 vert cloud — page `/u/[username]` débloquée. |
| E-08 (P1) | **Corrigé (0008)** | Grants TABLE service_role minimaux explicités (recensement scripts/tests : `profiles` S/I/U, `characters` +DELETE, `themes` S/I/U/D, `user_quests` S/I/U/D, SELECT `user_cards`/`wishlists`/`user_cosmetics`/`cosmetics`/`quests`/`drops_log`) + audit complet cloud vs migrations. **Purge physique des 72 fixtures exécutée** (validation orchestrateur reçue — données de test). |
| E-06, E-09, E-10, économie (puits) | **Inchangé (hors périmètre hotfix)** | Décisions produit (mix = arbitrage C/0, CSP + `.env.example` = B, puits = design). Restent à trancher par l'orchestrateur. |

## Nouveaux bugs découverts pendant le hotfix (pré-existants 0001, jamais exécutés avant la CI)

1. **Vol de booster par `due` négatif (réel, corrigé 0008).** `now()` est figé au
   début de chaque transaction ; une recharge concurrente pose
   `last_booster_recharge = now()` avec un `now()` en résolution **supérieure**
   (quelques ms) → `floor(epoch/360) = -1` → `least(10, count-1)` vole un
   booster et recule l'horodatage de 6 min. Sous 10 opens parallèles d'un même
   user (stock pile = 10) → 1 `NO_BOOSTER` aléatoire (tests de concurrence E
   en échec intermittent). Corrigé par `greatest(0, …)`. Juge : 40 opens
   cloud post-fix (4 vagues × 10) → 40/40 succès, 2 runs.
2. **`burn_card` cassé depuis 0001 (réel, corrigé 0008).** Alias inversé :
   `select c.base_rarity … from user_cards c join characters ch` — `user_cards`
   n'a pas de `base_rarity` → **42703 à chaque appel** (le burn n'a donc
   jamais fonctionné). Corrigé `ch.base_rarity` (commentaire d'intention en
   0008). Juge : burn cloud post-fix → `NOT_OWNER`/succès normaux.
3. **Piège pity × pool dégénéré (comportement SPEC, pas un bug).** Le pity
   force un tier legendary tous les 25 opens ; un thème sans perso legendary
   lève `EMPTY_POOL` et le **rollback annule aussi le reset de pity** → blocage
   permanent à 24 opens pour ce thème. Les thèmes de prod (seed 6 raretés × 6
   thèmes) couvrent tous les tiers : impact limité aux fixtures QA. Signalé
   comme edge connu ; correction test ci-dessous.
4. **Skew d'horloge client/serveur (test corrigé, pas un bug produit).**
   L'horloge du poste de dev a été mesurée **~0,4 s en avance** sur le serveur
   cloud (par à-coups NTP) : les filtres `.gte(created_at, marker_client)`
   excluaient des lignes pourtant créées pendant le test.

## Corrections de tests E justifiées (aucune assertion affaiblie sans écrit)

- **`tests/concurrency.test.ts` (test 3, pool d'1 perso)** : reset
  `pity_legendary`/`pity_mythic` à 0 à chaque vague (fixture, même principe que
  l'ancrage de recharge déjà utilisé). Le test cible l'atomicité des prints ;
  le pity forcé (point 3) est un contrat SPEC légitime qu'un pool rare-seul ne
  peut pas honorer. Les 200 prints distincts restent intégralement assertés.
- **`tests/concurrency.test.ts` (test 1)** : filtres temporels
  `.gte(created_at/ obtained_at, marker)` remplacés par l'isolation par user
  (user frais créé par le test → 100 % de ses lignes appartiennent au
  scénario) — le skew d'horloge (point 4) rendait le marqueur client fiable.
  Assertion inchangée (comptage complet drops_log, unicité des prints).
- **Bascule des `it.fails` → assertions normales** (E-01 ×3, E-02, E-03, E-04,
  E-05, E-07) : conformément à la consigne d'E (« à basculer par le
  propriétaire du fix »), le hotfix étant déployé. Le `it.fails` mix E-06 est
  conservé (hors périmètre).

## Limites connues de cette passe Agent 0

- Les 41 tests DB n'ont tourné que **sur le cloud** (pas de Docker sur ce
  poste) ; leur premier run en CI locale (Docker, migrations 0000→0008) reste
  le juge définitif — c'est la DoD. Comportements cloud vérifiés : concurrence
  4/4 (×2 runs), rls-audit 17/17, economy.business 14/14,
  rng.property + config-drift 33/33.
- Le diagnostic a nécessité des RPC d'audit temporaires (migration 0009),
  **toutes reverted et purgées** après usage ; la file cloud est revenue à
  0000→0008 exactement.
- Un incident `duplicate key` non reproduit a été observé une fois sur un état
  artificiel (compteur forcé) pendant la chasse au point 3 ; tous les états
  naturels depuis sont cohérents avec les corps canoniques (vérifiés byte par
  byte via `pg_get_functiondef`). Non reproductible = non traité, noté ici.
