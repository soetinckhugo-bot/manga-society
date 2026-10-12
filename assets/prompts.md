# Assets — Prompts finaux IA (Agent D)

> Les assets livrés dans `public/packs/`, `public/card-back.png` et
> `public/sounds/` ont été **générés procéduralement** par
> `scripts/generate-assets.mjs` (SVG artisanal → PNG via `sharp` ; sons
> synthèse PCM maison → WAV). Aucun asset externe, 100 % locaux, licences
> propres par construction.
>
> Si une passe IA de remplacement est décidée plus tard, voici les prompts
> finaux avec les specs exactes (ratio, fond, style). Les fichiers doivent
> garder les MÊMES chemins (le seed BDD `pack_art_url` pointe déjà dessus).

## Packs ×7 — `public/packs/{slug}.png` (ratio 3:4, ≥ 720×960)

Prompt type (un par thème, kanji et accent de la colonne) :

```
Premium anime trading card booster pack product shot, gold foil texture with
fine grain, large circular medallion in the center with the japanese kanji
"{KANJI}" embossed in metallic gold, thin double gold border frame with
ornamented corners, soft {ACCENT} glow halo behind the medallion, dark
near-black elegant background, studio lighting, vertical composition, no
text besides the kanji, ratio 3:4
```

| slug    | kanji | accent (glow)      |
|---------|-------|--------------------|
| shonen  | 少    | flame orange #ff6b35 |
| shojo   | 花    | pink #f472b6       |
| webtoon | 文    | violet #a78bfa     |
| big3    | 王    | gold #d4a94e       |
| seinen  | 青    | indigo #818cf8     |
| isekai  | 異    | teal #2dd4bf       |
| mix     | 混    | silver #e4e4e7     |

## Verso carte — `public/card-back.png` (ratio 2.5:3.5, ≥ 600×840)

```
Dark elegant trading card back, traditional japanese seigaiha wave pattern
in muted gold lines on near-black background, thin double gold border with
small gold diamonds in each corner, central dark medallion with double gold
ring containing the kanji "漫" in metallic gold, minimal, symmetric, no
other text, ratio 2.5:3.5
```

## Sons — `public/sounds/*.wav` (< 200 KB chacun, CC0)

Sources CC0 recommandées si remplacement : **Kenney** ("Casino Audio",
"Impact Sounds"), **Freesound** (filtrer licence CC0), **Mixkit**
(royalty-free). Mapping :

| fichier        | usage séquence                          | spec                                    |
|----------------|-----------------------------------------|-----------------------------------------|
| `tear.wav`     | déchirure du pack                       | bruit de papier/foil qui se déchire, ~0.6 s |
| `flip.wav`     | retournement carte (C/U)                | whoosh court, ~0.2 s                    |
| `rare.wav`     | reveal Rare                             | carillon 2 notes, ~0.7 s                |
| `epic.wav`     | reveal Épique                           | arpège 3 notes + shimmer, ~1 s          |
| `legendary.wav`| reveal Légendaire                       | fanfare chaude, ~1.4 s                  |
| `mythic.wav`   | reveal Mythique (le plus fort du jeu)   | drone + arpège ascendant, ~1.8 s        |
| `coin.wav`     | booster doré                            | ding de pièce, ~0.45 s                  |
| `click.wav`    | micro-interactions UI                   | clic sec, ~0.1 s                        |

Budget : chaque fichier < 200 KB, préchargés 2-3 premiers uniquement
(`tear`, `flip` dès l'écran pack), le reste en lazy.
