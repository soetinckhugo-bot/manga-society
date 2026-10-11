# ADR 0002 — Pourquoi l'idempotence côté SQL

- **Statut** : accepté
- **Date** : 2025 (MVP MANGA SOCIETY)
- **Décideurs** : Agent Architecte (Prompt 0)

## Contexte

Toute mutation d'économie (ouverture de booster, burn, claim de pack/quête, achat) doit
être **idempotente** : un double-clic, un retry réseau ou un refresh pendant la requête ne
doit jamais débiter deux fois, insérer deux fois ou imprimer deux prints. L'idempotency
key (uuid v4) est générée par le client **à chaque tentative de clic** et transmise avec
la requête.

Deux implantations étaient possibles :

1. **Middleware applicatif** (dans les route handlers Next.js) : le handler vérifie en
   amont si la clé existe, refuse ou rejoue le résultat, puis exécute la mutation.
2. **Côté SQL** : la table `idempotency_keys` (key pk, user_id, endpoint, result jsonb,
   created_at) est insérée par la RPC elle-même —
   `INSERT ... ON CONFLICT (key) DO NOTHING`, early return du résultat stocké — au sein de
   la MÊME transaction que la mutation.

## Décision

**Idempotence côté SQL**, au sein de chaque RPC économique.

## Justification

1. **Zéro fenêtre de course.** Une vérification applicative (« la clé existe-t-elle ? »)
   puis une exécution (« exécuter la mutation ») sont deux opérations séparées : entre les
   deux, une requête concurrente portant la même clé peut passer le contrôle et débiter
   deux fois. `INSERT ... ON CONFLICT (key) DO NOTHING` est atomique par construction :
   une seule transaction peut gagner l'insertion ; toutes les autres lisent le résultat
   stocké.
2. **Atomicité avec le débit.** La garde d'idempotence vit dans la même transaction que le
   débit de booster, l'insertion des cartes et l'incrément atomique des prints. Un crash
   après le débit mais avant la fin rollback tout — y compris la consommation de la clé —
   au lieu de laisser un état « clé consommée mais mutation perdue » ou l'inverse.
3. **Protection uniforme des trois vecteurs** — double-clic (deux requêtes quasi
   simultanées), retry réseau (le client renvoie la MÊME clé), refresh pendant la requête —
   avec un seul mécanisme, indépendant du transport.
4. **Le retry devient gratuit et sûr.** Rejouer une requête avec la même clé retourne le
   résultat original (jsonb) sans effet de bord ; le client peut retry sans timeout
   agressif ni peur du double-débit.
5. **Simplicité de la couche applicative.** Le handler reste stupide : auth → validation
   Zod → rate limit → appel RPC. Aucun état distribué à gérer en mémoire applicative,
   aucune dépendance à un store externe (Redis/Upstash) pour l'idempotence — le rate
   limiting reste, en complément (ceinture ET bretelles), mais il n'est plus l'unique
   rempart contre les doublons.
6. **Auditabilité.** La table conserve qui a appelé quel endpoint, quand, et le résultat
   exact retourné — base d'investigation en cas d'incident économique.

## Conséquences

- **Positives** : invariant « une clé = au plus un effet » garanti par le moteur Postgres ;
  double-clic/retry/refresh sans effet ; retry sémantique côté client ; handlers simplifiés.
- **Négatives / règles** : chaque nouvelle RPC économique DOIT implanter le motif
  insert-On-Conflict-early-return ; le résultat stocké doit être sérialisable (jsonb) et
  stable (versionné dans `types/api.ts`) ; les clés ne sont jamais nettoyées avant leur
  fenêtre d'usage (un nettoyage périodique > 24 h peut être ajouté plus tard) ; le rate
  limiting applicatif reste obligatoire en complément.

## Alternative écartée

**Middleware applicatif** : introduit une fenêtre de course entre la vérification et
l'exécution, exige un store d'état partagé fiable entre instances (les handlers Next.js
sont sans état), et déplace l'invariant le plus critique du produit loin du moteur
transactionnel qui peut le garantir.
