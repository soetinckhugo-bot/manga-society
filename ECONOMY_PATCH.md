# ECONOMY_PATCH — Propositions d'équilibrage (Agent E)

> Document d'input pour Agent 0 / le designer. **Agent E ne décide rien** : chaque
> levier est chiffré avant/après, la décision et l'implémentation appartiennent
> au propriétaire. Sources : `report-economy.md` (scénario `live`) et variantes
> `report-economy-pity-reset.md`, `report-economy-streak-config.md`,
> `report-economy-wishlist1000.md` — tous régénérables par `npx tsx scripts/sim-economy.ts [--scenario …]`.

## Méthode et limites

- Monte-Carlo déterministe (graines fixes) : **50 joueurs × 30 jours**, 10 ouvertures/j + daily pack + premium.
- Réplique des règles live vérifiée ligne par ligne contre `supabase/migrations/0001_functions.sql` : pity à compteur (pas de reset sur drop naturel), doré ×2 L/M tous les 10 (non appliqué au daily pack — la RPC ne le double pas), recharge +1/6 min cap 10, daily pack = 5 rolls Épique+ (poids 5 / 2.4 / 0.6), premium = 4 rolls pleins + slot garanti 85/15, streak SQL `least(streak,10)*5` avec J7 = 0, quêtes 3/j, burn = 40 % des doublons/jour.
- Hypothèses documentées dans le rapport : composition des tiers = percentiles globaux (C 25 / U 30 / R 25 / E 20 / L 5 / M 1), quêtes toutes complétables (169,3 chakra/j), shop 1 achat/j.
- **Non modélisé** : le rythme réel des joueurs humains, les événements, le contenu post-J30, la demande wishlist réelle (scénarisée à 0 et 1 000).

## Constats live (scénario `live`)

| Indicateur | Valeur | Commentaire |
|---|---:|---|
| Stock chakra J30 (moyenne) | **6 077** | dont ~600/j gagnés après J26 sans aucun puits |
| Boutique | épuisée ~J26 | 14 cosmétiques ≈ 11 150 chakra cumulés, puis plus rien à acheter |
| Taux L mesuré | **5,8 %/carte** | nominal 2,40 % — le daily pack (C/U/R à 0) fournit 48 % de tous les L à lui seul |
| Taux M mesuré | 1,3 %/carte | nominal 0,60 % |
| L forcés par le pity | 14 % des L | compteur sans reset sur drop naturel = ~1 L garanti toutes les 25 ouvertures, quoi qu'il arrive |
| Ouvertures dorées | 10 % | conforme (9→reset) |
| Album isekai (151) | médiane 27 j | 6/50 complétés en 30 j |
| Album shonen (3 149) | <1 % à J30 | rythme de collection très lent hors thème ciblé |
| 1er booster premium F2P | J19 | 1 000 cartes ; un premium = 5 cartes dont 1 L/M garanti(e) |
| Recharge exploitable | ~250 ouv./jour | +1/6 min cap 10 : la contrainte réelle est le temps, pas la règle |

## Leviers chiffrés

### L1 — Pity avec reset sur drop naturel (`pity-reset-naturel`)

Le pity live est un **minuteur** : toutes les 25 ouvertures, un L est garanti même si le joueur a déjà droppé plusieurs L entre-temps. Avec reset sur drop naturel, le pity redevient une sécurité de bad luck.

| Métrique | Live | Avec reset | Δ |
|---|---:|---:|---:|
| L/ouverture (≥1) | 28,6 % | 25,6 % | −3,0 pts |
| M/ouverture (≥1) | 6,7 % | 6,4 % | −0,3 pt |
| L forcés | 14 % des L | ~0 % | sécurité seulement |
| Stock chakra J30 | 6 077 | 5 720 | −357 |

Coût de mise en œuvre : faible (migration SQL). Attention : les tests E qui documentent la sémantique actuelle (`tests/config-drift.test.ts`, `tests/economy.business.test.ts`) passent au vert quand la sémantique change — à faire basculer par le propriétaire du fix.

### L2 — Aligner la streak SQL sur `GAME_CONFIG.streak.chakraByDay` (écart E-03)

La table SQL paie `least(streak,10)*5` (J1 = 5), la config en promet 20. Le J1 est le plus important pour la rétention.

| Métrique | Live | Config | Δ |
|---|---:|---:|---:|
| Chakra J1 | 5 | 20 | ×4 rétention J1 |
| Chakra cumulé 30 j | 1 190 | 965 | −225 |
| Stock chakra J30 | 6 077 | 5 952 | −125 |

### L3 — Multiplicateur de burn « demande wishlist » : effet pervers documenté

`--wishlist-avg 1000` (multiplicateur ×2, ≈1 000 envies sur le perso) :

| Métrique | Demande ×1 | Demande ×2 | Δ |
|---|---:|---:|---:|
| Stock chakra J30 | 6 077 | **17 135** | **+11 058 (+182 %)** |

Le levier est conçu pour rendre le burn plus attractif quand un perso est demandé — mais brûler **paie** du chakra : plus la demande monte, plus l'offre de monnaie monte. C'est un amplificateur d'inflation, pas un régulateur. À trancher en design : inverser le signe (forte demande = burn moins rémunérateur), plafonner, ou découpler la demande de la rémunération.

### L4 — Le daily pack, vrai robinet des Légendaires

48 % des L sur 30 j viennent du daily pack, dont le pool interne est Épique/Légendaire/Mythique en poids 5/2.4/0.6 → **~29 % de L par carte quotidienne**. Toute décision sur le taux de L « ressenti » passe d'abord par là (baisser le poids L du daily, passer le daily en « Épique garanti + raretés normales », etc.). Non simulé ici : le sim ne fait pas de variante daily (faible effort si demandé).

### L5 — Manque de puits récurrent (constat n°1)

Après épuisement de la boutique (~J26), le stock croît de ~600 chakra/j sans évier. Quelques options (choix design, non chiffrées faute de modèle du contenu) : cosmétiques à prix progressifs, renouvellement périodique de la boutique, coût de reroll déjà existant à augmenter, mécanismes de destruction de chakra.

### Hors scope simulé

- **Plafonnement du rythme d'ouverture** : la recharge permet ~250 ouvertures/jour à un joueur inactif-qui-clique ; la sim retient 10/j (consigne). Si la spec veut une économie calibrée sur 10/j, il faut un plafond dur (ex. cap quotidien d'ouvertures), sinon l'inflation réelle sera bien supérieure à toutes les projections ci-dessus.
- **E-02 (cap wishlist), E-04 (double achat), E-06 (thème mix)** : trous de code, pas d'économie — voir QA_REPORT.md.

## Synthèse (ordre suggéré, décision requise)

1. **Puits récurrent (L5)** avant tout : rien d'autre ne compte tant que ~600 chakra/j s'accumulent sans sortie.
2. **L3 (signe du multiplicateur)** : risque majeur d'hyperinflation dès qu'une wishlist se remplit.
3. **L4 (daily pack)** si le taux de L ressenti est trop élevé.
4. **L1 + L2** : corrections de cohérence SPEC/code, faibles coûts, effets modérés et déflationnistes — elles peuvent partir ensemble.
