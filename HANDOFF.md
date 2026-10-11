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
4. `supabase/schema.sql` — schéma complet des 12 tables + contraintes + index
   (collection : user_id+obtained_at, character_id+base_rarity, themes GIN,
   lower(name_romaji) trigram) + RLS deny-by-default sur TOUTES les tables.
5. `supabase/migrations/0001_functions.sql` — les 11+ RPC SECURITY DEFINER idempotentes
   (open_booster, open_premium_booster, claim_daily_pack, burn_card,
   update_quest_progress, claim_quests, ensure_daily_quests, update_login_streak,
   buy_cosmetic, apply_cosmetic, reroll_cosmetic, toggle_wishlist) + `pgcrypto`.
6. `supabase/seed.sql` — 6 thèmes, ~15 cosmétiques, pool de quêtes.
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

- Choix final manifest : `public/manifest.webmanifest` (statique) vs `app/manifest.ts`
  (généré) — les deux sont listés dans `SPEC.md` §2.1 ; trancher lors de la production du
  fichier (recommandation : `.webmanifest` statique, plus simple à précacher).
- Nettoyage périodique de `idempotency_keys` (> 24 h) : pas implémenté en V1, à prévoir.
- Upstash pour le rate limiting distribué : l'interface est spécifiée (`lib/server/ratelimit.ts`),
  l'implémentation V1 reste un token bucket mémoire.
- Notifications push et Realtime : explicitement exclu du MVP (cf. prompt, V2).

---
*Prochaine étape : produire les livrables §3 (ou confirmer qu'ils sont produits en parallèle),
puis lancer A + B + C en parallèle selon `SPEC.md` §10.*
