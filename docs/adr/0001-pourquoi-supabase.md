# ADR 0001 — Pourquoi Supabase

- **Statut** : accepté
- **Date** : 2025 (MVP MANGA SOCIETY)
- **Décideurs** : Agent Architecte (Prompt 0)

## Contexte

MANGA SOCIETY est un jeu de collection web gratuit avec une économie interne sensible :
booster rechargeant, pity, compteurs dorés, monnaies douce (chakra) et premium, prints
séquentiels atomiques par personnage, idempotence stricte sur toute mutation. Les
candidats étaient :

1. **API maison + ORM** (ex. route handlers Next.js + Prisma/Drizzle sur Postgres).
2. **Supabase** (Postgres managé + Auth + Realtime + RPC SECURITY DEFINER + RLS).
3. **Firebase** (Firestore, Cloud Functions, Auth).

## Décision

**Supabase**, pour quatre raisons décisives :

1. **L'économie vit dans la base, pas dans une API.** Nos invariants sont transactionnels
   (« débiter un booster ET insérer 5 cartes ET incrémenter les prints ET progresser les
   quêtes, ou rien »). Une API maison doit recréer en TypeScript une couche transactionnelle
   et concurrentielle que Postgres exécute nativement, mieux et plus sûrement. Les RPC
   `SECURITY DEFINER` permettent d'exécuter ces séquences avec les droits du serveur tout
   en gardant une surface minimale : les route handlers restent une couche mince
   (auth → validation → appel RPC).
2. **RLS deny-by-default gratuit.** La politique « user A ne lit/modifie rien de user B »
   est déclarative et auditée (`auth.uid() = user_id`), plutôt que réimplémentée à la main
   dans chaque requête de l'API. Firestore a des règles comparables, mais…
3. …**Postgres, pas une base documentaire.** Nos requêtes sont relationnelles et
   analytiques : collection filtrée (thème/rareté/recherche trigram), comptes agrégés,
   curseurs de pagination, contraintes d'intégrité (`unique(character_id, print_number)`,
   checks d'enum). Firestore imposerait une dénormalisation permanente et des transactions
   limitées (pas de verrous pessimistes sur lectures-écritures croisées).
4. **Auth intégré** : email magic link + OAuth (Discord, Google…) sans serveur d'identité
   à opérer, avec une table `auth.users` directement joignable en clé étrangère — la
   création du `profile` au signup n'est qu'un trigger/insert cascade.

## Conséquences

- **Positives** : atomicité des ouvertures de boosters dans une seule transaction SQL ;
  idempotence au plus près de l'écriture (voir ADR 0002) ; audit RLS déclaratif ; zéro
  serveur d'application métier à maintenir (les route handlers Next.js n'ont aucune
  logique d'économie) ; coût quasi nul au démarrage (tiers gratuit), scalabilité gérée.
- **Négatives / contraintes** : une partie du savoir-faire vit en SQL (compétence requise) ;
  la logique est verrouillée côté Postgres (migrations à discipliner) ; le couplage à un
  fournisseur existe, mais le schéma reste du Postgres standard largement portable ;
  le rate limiting applicatif reste à faire côté handlers (le RLS ne limite pas les
  volumes).

## Alternatives écartées

- **API maison + ORM** : réimplémentation de la sérialisation transactionnelle, du deny
  by default et de l'idempotence côté applicatif — plus de code, plus de surfaces de
  course, aucun gain fonctionnel pour ce produit.
- **Firebase** : règles de sécurité correctes mais modèle documentaire inadapté aux
  requêtes relationnelles et à l'atomicité multi-entités de l'économie ; verrous de
  concurrence insuffisants pour les prints séquentiels.
