# Spec UX — Multi-open ×5 / ×10 (V1.1)

> Document de spec pour un futur agent. Un dev qui n'a jamais travaillé sur
> ce projet doit pouvoir coder la feature rien qu'avec ce fichier +
> `SPEC.md` + `HANDOFF.md` (section Agent D). C'est une spec de
> **comportement et d'UX** : toute décision d'économie serveur (pity, doré,
> débit du stock, RPC) reste du ressort de l'Agent A ; tout point d'entrée
> sur les pages reste du ressort de l'Agent B (via HANDOFF + PR séparée).
>
> État : proposition V1.1 — **non implémentée**. Décisions produit
> verrouillées indiquées « (verrouillé) ».

---

## 1. But

Permettre l'ouverture de N boosters (N = 5 ou 10) en une seule action,
avec une séquence d'ouverture enchaînée (le plaisir du reveal est
conservé, le click-fest est éliminé). Le multi-open est un **raccourci
d'UX, jamais un avantage économique** : chaque booster du multi se
comporte exactement comme s'il avait été ouvert un par un.

## 2. Hors scope EXPLICITE

- **Toute modification de pity / doré / taux / recharge / stock (verrouillé).**
  Chaque booster d'un multi-open compte individuellement dans le pity et
  le compteur doré, comme en V1 — c'est le comportement attendu par
  construction, aucune règle ne change, aucune RPC économique n'est
  modifiée par cette feature côté front.
- **Tout fichier hors `components/booster-opening/`** (et ses clés i18n
  `messages/{fr,en}/opening.json`). Les besoins dans le périmètre d'autres
  agents sont formulés en §9 (demandes A et B) — pas de contournement.
- Bonus/malus multi (réduction de coût, carte bonus, animation « jackpot »
  spéciale) : non prévus. La spec n'en interdit pas l'ajout futur, mais
  rien ici ne les prévoit.
- Le booster premium (1 carte) et le pack du jour ne participent PAS au
  multi-open en V1.1 (verrouillé — voir §8 variantes).

## 3. Flow complet

```
Page /boosters (B)                    Séquence (components/booster-opening/, D)
─────────────────────                 ─────────────────────────────────────────
Clic "Ouvrir ×5" ou "Ouvrir ×10"
1. idempotency_key = uuid v4          (rien ne s'affiche encore)
   (UNE seule clé, générée à ce clic)
2. POST /api/boosters/open-multi      PENDING STATE (bouton/spinner côté B,
   { theme_slug, count: 5|10,                la séquence ne monte qu'après
    idempotency_key }                         la réponse 200 — SPEC §5.1)
        ──────────────────────►
                  200 { pulls: [ {cards[5], is_golden?} × N ],
                        booster_count, pity…, golden_counter… }
3. Monte <BoosterOpening pulls …>
   (données en props, AUCUN fetch
    pendant toute la séquence)
                                      PHASE PACK (×N)
                                      ───────────────
                                      • 1 seul écran pack, médaillon du
                                        thème, badge « ×N » bien visible
                                        sur le pack + compteur « N
                                        boosters · 5N cartes »
                                      • déchirure IDENTIQUE à la V1
                                        (drag le long du haut OU bouton
                                        « Ouvrir ×N »)
                                      → déchirure = déverrouille TOUT le
                                        multi (pas une déchirure par
                                        booster — verrouillé)

                                      PHASE REVEAL (enchaînée)
                                      ────────────────────────
                                      Pour chaque booster b de 1..N :
                                        • en-tête de section : « Booster
                                          b/N » (+ pastille dorée si
                                          pulls[b].is_golden)
                                        • les 5 cartes de pulls[b] se
                                          révélent une par une (flip 3D,
                                          Espace/maintenir/tap, identique
                                          V1)
                                        • progression globale : UNE pastille
                                          par carte (5N total), regroupées
                                          par booster (séparateur visuel
                                          entre groupes de 5) ; le groupe
                                          courant est en évidence
                                        • fin des 5 cartes → transition
                                        courte vers le booster suivant
                                        (la carte face cachée suivante
                                        glisse en place)
                                      Intensité des FX en multi
                                      (verrouillé) : sons/particules
                                      pleins UNIQUEMENT pour les cartes
                                      Épique+ ; C/U = flip sobre muet
                                      (anti-fatigue sur 50 cartes).

                                      PHASE RÉCAP
                                      ────────────
                                      Voir §5.
```

**Durée cible** : cadence V1 inchangée (~4-5 s/carte sans skip) → ×5 ≈
1 min 40, ×10 ≈ 3 min 20 sans intervention. Le skip (§6) reste disponible
à tout moment ; « Tout révéler » accélère en ~0,4 s/carte.

## 4. Coût & idempotence (comportement client)

- **UNE seule `idempotency_key` (uuid v4) générée au clic** « Ouvrir ×N »,
  jamais par session, jamais régénérée en cours de séquence (SPEC §3).
- **UNE seule requête HTTP, donc UNE seule transaction serveur** : le
  client n'envoie jamais N appels à `/api/boosters/open`. L'endpoint
  exact (`/api/boosters/open-multi` ou extension de l'existant avec
  `count`) et la RPC correspondante sont **à spécifier/implémenter par
  l'Agent A** — cette spec ne décrit que le contrat de réponse attendu :
  `pulls: OpenedCardDto[][]` (+ les compteurs déjà présents dans
  `OpenBoosterResponse`). Le débit du stock (N boosters), le pity, le
  doré s'appliquent booster par booster DANS cette transaction, comme N
  ouvertures séquentielles atomiques — règle métier serveur, pas du client.
- **Aucune logique économique côté client** : le client n'affiche que ce
  que la réponse 200 contient (pity après, stock après, doré par
  booster). Zéro calcul local de taux, zéro décrément local.
- Le bouton « Ouvrir ×N » est **désactivé si le stock < N** (affichage
  « X/{max} boosters » existant suffit ; le serveur reste la garde
  finale et renverra `NO_BOOSTER`).
- Le client choisit ×5 ou ×10 librement **tant que le stock le permet** —
  le serveur peut légalement servir un multi DÉCALÉ (ex. stock 8 → une
  erreur `NO_BOOSTER` globale OU un pulls de 8 ? — **décision ouverte**,
  voir §8 ; la recommandation est : refus strict `NO_BOOSTER`, le stock
  ne change pas entre le clic et la RPC si le bouton était juste, et la
  fenêtre de course est couverte par l'idempotence).

## 5. Récap multi

- **Éventail par booster** : les N boosters forment N mini-groupes
  (empilés verticalement en colonnes sur desktop, accordéon horizontal
  scrollable sur mobile). Chaque groupe : ses 5 cartes en éventail V1
  (compact), badge doré si `is_golden`, son en-tête « Booster b/N ».
- **Meilleure carte globale** : une seule, calculée sur l'ensemble des
  5N cartes (rareté max, égalité → plus bas print — même règle que V1,
  exportée du récap existant). Mise en avant en haut du récap : grande
  carte + glow + « Meilleure carte », AU-DESSUS des groupes.
- **Compteur** : « ×N boosters · 5N cartes · K nouvelles »
  (`is_new_character` agrégé côté client, affichage pur).
- **PNG partageable multi** (même pipeline canvas que V1) :
  - format inchangé : paysage 1200×630, og-ready, < 300 Ko cible ;
  - contenu : meilleure carte globale grande (droite) ; à gauche le
    compteur ×N/5N/K + nom du thème ; bandeau bas : les **meilleures
    cartes de chaque booster** (jusqu'à 10 vignettes, cadre rareté,
    `#print`) ; si un booster du multi est doré, pastille « doré » sur
    sa vignette ;
  - dégradé identique à V1 (silhouette de repli si image CORS refusée).
- Actions inchangées : « Ouvrir un autre » (×1 par défaut — le multi est
  un choix explicite à chaque fois, verrouillé), « Changer de booster »,
  « Voir la collection », « Copier le lien », « Image ».

## 6. Garde-fous UX

- **Pending state** : entre le clic et la réponse 200, bouton en état
  « Ouverture… » désactivé (composant B). Une fois la réponse reçue, la
  séquence tourne 100 % localement : aucun spinner interne, aucun fetch.
- **Interruption (Échap / fermeture)** : le résultat serveur est DÉJÀ
  validé et commit (la transaction est passée avant le montage de la
  séquence). Interrompre n'annule RIEN côté serveur — les cartes sont
  obtenues. L'Échap pendant le reveal saute **directement au récap** avec
  toutes les cartes marquées révélées (comportement V1 étendu : skip
  global). Le récap et les actions (collection, image) fonctionnent donc
  même sur une séquence interrompue à 20 %.
- **Skip par booster** : bouton « Passer ce booster » (visible au-dessus
  de « Tout révéler » pendant un reveal de groupe) : marque les 5 cartes
  du booster courant comme révélées (sans FX) et saute au booster
  suivant ; sur le dernier booster, saute au récap. Distinct du skip
  global (Échap) qui va au récap direct.
- **Refresh / fermeture d'onglet pendant la séquence** : l'état React
  est perdu, mais la réponse serveur a été persistée localement AVANT le
  montage de la séquence (recommandation : `sessionStorage`, clé =
  l'`idempotency_key`, valeur = la réponse 200 ; effacée à la fermeture
  propre du récap ou de la séquence). Au remontage :
  - si une réponse persistée INCOMPLÈTE existe → écran sobre « Résultat
    déjà reçu » : « Tu as déjà ouvert ces N boosters. » + boutons
    « Voir le récap » (rejoue le récap depuis les données persistées,
    sans re-débit) et « Fermer » (purge la copie). **Aucun re-clic, aucun
    re-fetch** : l'idempotence a déjà consommé la clé côté serveur.
  - **Ce n'est PAS de l'optimistic UI économique** (interdit SPEC §11) :
    on ne fait que conserver une réponse serveur déjà reçue, comme le
    navigateur conserve une page. Aucune mutation, aucun calcul.
- **Double-clic / retry réseau** : la même clé est retentée telle quelle
  (le client ne régénère PAS de clé sur un retry silencieux React Query /
  fetch) → le serveur renvoie le résultat stocké (comportement
  idempotence existant). Un NOUVEAU clic après échec affiché = nouvelle
  clé = nouveau débit (comportement SPEC §3).
- **Zéro blocage économique silencieux** : toute erreur métier
  (`NO_BOOSTER`, `RATE_LIMITED`…) s'affiche via le namespace `errors`
  existant et NE monte PAS la séquence.

## 7. Clavier, accessibilité, reduced-motion

- Clavier identique V1 étendu : Espace/Entrée = carte suivante
  (maintenir = avance rapide), Échap = skip global récap. Pas de raccourci
  dédié au skip-booster (bouton focalisable, ordre logique du DOM).
- `role="dialog" aria-modal` conservés ; la progression globale expose
  `role="progressbar"` avec `aria-valuemax = 5N`.
- `prefers-reduced-motion` : reveals instantanés, pas de particules, pas
  de transitions entre boosters — règle V1 non modifiée.
- Sons : voir §3 (Épique+ uniquement en multi ; le tear et le coin doré
  ne jouent qu'une fois, à la déchirure unique).

## 8. Variantes & décisions ouvertes

- **×5 seul** : bouton « Ouvrir ×5 » (stock ≥ 5). **×10 seul** : bouton
  « Ouvrir ×10 » (stock ≥ 10). **Mixte** : les boutons ×N cohabitent avec
  le bouton ×1 existant ; chaque clic reste une mutation indépendante à
  sa propre clé. Rien n'est automatique ni chaîné.
- **Décisions ouvertes (à trancher par l'orchestrateur, PAS par
  l'implémenteur)** :
  1. Multi avec stock insuffisant : refus strict `NO_BOOSTER`
     (recommandé) vs débit partiel ?
  2. Une seule déchirure pour tout le multi (recommandé, verrouillé ici)
     vs une déchirure par booster ?
  3. L'endpoint : nouveau `/api/boosters/open-multi` vs `count` sur
     l'existant (Agent A tranche ; le contrat de réponse `pulls` est
     fixé par cette spec).
  4. Multi sur le pack du jour / premium : exclu V1.1 (verrouillé ici).
  5. Plafond : uniquement 5 et 10 (verrouillé) vs champ libre ?

## 9. Découpage agent (frontières SPEC §4)

- **Agent D** (`components/booster-opening/`) : tout le contenu de cette
  spec. Contrat évolutif proposé pour `BoosterOpeningProps` :
  ```ts
  // V1.1 : multi-open. Rétrocompatibilité : si `pulls` est absent,
  // `cards` est traité comme un booster unique.
  pulls?: OpenedCardDto[][]; // 1 entrée par booster, chacune 5 cartes
  ```
  (le montage V1 `{cards, isGolden}` reste supporté jusqu'au câblage B.)
- **Agent A** (demande via HANDOFF, jamais contournée) : endpoint/RPC
  multi (1 transaction, débit de N boosters, pity/golden booster par
  booster, réponse `pulls` + compteurs, idempotence sur la clé unique).
- **Agent B** (demande via HANDOFF, jamais contournée) : boutons
  « Ouvrir ×5 / ×10 » dans le panneau thème (désactivés si stock < N,
  pending state), passage de `pulls` à `<BoosterOpening>`, retrait du
  fallback `cards` quand le câblage est fait.

## 10. Critères d'acceptation

1. Un clic « Ouvrir ×10 » = 1 idempotency_key = 1 requête = 1 transaction
   serveur ; 10 boosters débités, pity/golden/compteurs corrects côté
   serveur (test smoke Agent A).
2. La séquence complète (pack → 50 reveals → récap) ne déclenche AUCUN
   fetch après le 200 initial (onglet Network à l'appui).
3. Échap à n'importe quel moment → récap complet fonctionnel ; les cartes
   sont dans la collection (le serveur avait déjà commit).
4. Refresh à mi-séquence → écran « Résultat déjà reçu », récap rejouable
   sans re-débit, purge propre.
5. Double-clic sur « Ouvrir ×5 » → 1 seul débit (idempotence) ; pas de
   montage double de la séquence.
6. Stock < N → bouton désactivé côté B + refus serveur propre si course.
7. Perf : mêmes budgets que V1 (transform/opacity, particules < 300,
   frame drops < 5 % mesurés par E sur le scénario multi : ×10, skip
   global à mi-parcours, reveal d'une Mythique).
8. Parité fr/en des nouvelles clés i18n ; zéro literal UI.
9. `prefers-reduced-motion` : séquence sobre et instantanée.
