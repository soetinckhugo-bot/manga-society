# REPORT-ECONOMY — Simulation économique (Agent E)

> Monte-Carlo déterministe : **50 joueurs × 30 jours**, scénario `streak-config`. Réplique fidèle des règles vivantes (0001+0004 : pity à compteur, doré ×2 tous les 10, recharge 240/j cap 10, premium 5 cartes = 4 rolls + slot garanti 85/15, quêtes 3/j, burn 40 % des doublons, shop 1 achat/j).

## Hypothèses (documentées)

- **10 ouvertures/jour** (consigne PROMPT E) : la recharge réelle (+1/6 min) permettrait jusqu’à ~250 ouvertures/jour à un joueur sans vie privée — levier majeur, voir ECONOMY_PATCH.
- Composition des tiers par thème = percentiles globaux du pool réel (C 25 % / U 30 % / R 25 % / E 20 % / L 5 % / M 1 %).
- Quêtes : les 3/jour sont supposées toutes complétables au rythme simulé → revenu moyen 169.3 chakra/j.
- Demande wishlist moyenne retenue : 0 → multiplicateur de burn ×1.00.
- Shop : 1 achat/jour du cosmétique non possédé le moins cher (streak-7 exclu, non achetable).

## Inflation chakra (stock moyen/joueur, scénario avec dépenses shop)

| Jour fin | Stock moyen | médiane | p90 | Total gagné (moy.) | Total dépensé (moy.) |
|---|---:|---:|---:|---:|---:|
| 1 | 61 | 59 | 64 | 211 | 150 |
| 7 | 518 | 518 | 554 | 2368 | 1850 |
| 14 | 775 | 763 | 925 | 6025 | 5250 |
| 30 | 5952 | 5880 | 6569 | 17102 | 11150 |

## Raretés : taux effectifs mesurés (pity à compteur, sans reset sur drop naturel)

| Tier | Poids nominal /carte | Taux mesuré /carte | Taux mesuré /ouverture (≥1) |
|---|---:|---:|---:|
| Légendaire | 2.40 % | 5.80 % | 28.6 % |
| Mythique | 0.60 % | 1.35 % | 6.7 % |

- Forcés par le pity : **14 %** des L (~1 L garanti par ouverture forcée), **4 %** des M ; ouvertures dorées : 10 % (nominal 10 %).

## D’où viennent les Légendaires ? (répartition mesurée sur 30 j)

| Source | L/joueur | Part des L |
|---|---:|---:|
| Boosters gratuits/dorés (rotation) | 49.2 | 51 % |
| Daily pack (Épique+ garanti) | 45.7 | 48 % |
| Booster premium (85/15) | 1.0 | 1 % |
| _dont forcés par le pity_ | _13.0_ | _14 %_ |

## Progression collection

- **Album isekai (151 persos)** : complété en médiane **27 jours**, p90 **29** ; 6/50 joueurs l'ont complété en 30 j.
- **Album shonen (3149 persos)** : 25 persos distincts en moyenne à J30 (0.8 %).
- **Booster premium F2P** : premier premium à J19.0 en moyenne (10 pts = 1 000 cartes ; ~55 cartes/j).
- Cartes obtenues/joueur à J30 : 1655 en moyenne.

## Pression wishlist sur la burn value (par carte brûlée)

| Rareté | Base | ×1,5 (≈500 envies) | ×2 (1 000) | ×3 (≥2 000, plafond) |
|---|---:|---:|---:|---:|
| common | 5 | 8 | 10 | 15 |
| uncommon | 8 | 12 | 16 | 24 |
| rare | 15 | 23 | 30 | 45 |
| epic | 30 | 45 | 60 | 90 |
| legendary | 80 | 120 | 160 | 240 |
| mythic | 200 | 300 | 400 | 600 |

## Verdict

1. **Inflation chakra** : le stock croît sans fin après épuisement de la boutique (~11 150 chakra cumulés, épuisée vers J26) ; à J30 le joueur gagne encore ~600 chakra/j sans puits. Un puits récurrent est nécessaire avant tout autre réglage.
2. **Le daily pack est la moitié des L** (48 %, taux interne ~29 %/carte car C/U/R à 0) : c'est lui, bien plus que le pity, qui gonfle le taux effectif de L à 5.80 %/carte (nominal 2.4 %).
3. **Pity « à compteur »** : 14 % des L viennent d'un déclenchement planifié tous les 25 ouvertures, le compteur ne se remet pas à zéro sur un drop naturel — voir la variante `pity-reset-naturel` (L/ouverture 28.6 % → ~25,6 %, forcés → 0 %).
4. **Effet pervers du multiplicateur wishlist** : une demande ×2 (≈1 000 envies) transforme le burn en machine à chakra (stock ×~2,8 à J30, report-economy-wishlist1000.md) — le levier augmente l'offre de monnaie au lieu de la réduire.
5. **Streak SQL vs config** (E-03) : aligner sur `chakraByDay` paie J1 20 au lieu de 5 (meilleure rétention) mais ~225 chakra de moins sur 30 j (léger désinflationniste) — variante `streak-config`.

Détail et variantes chiffrées : **ECONOMY_PATCH.md**. Agent E ne décide rien — chaque levier est à trancher par Agent 0 / le designer.

---
*Simulation exécutée en 74 ms — reproductible (graines fixes), scénario `streak-config`.*