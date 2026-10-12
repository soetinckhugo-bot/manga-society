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
