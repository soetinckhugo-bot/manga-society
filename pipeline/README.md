# MANGA SOCIETY — Pipeline de données (Agent C)

Remplit `characters` depuis AniList (GraphQL, sans clé) avec fallback image Jikan
v4. Idempotent (`anilist_id` unique → upsert), reprenable après crash
(`--resume`, checkpoint `checkpoint.json`), jamais d'appel API au runtime du jeu.

## Commandes

```bash
# Dry-run : parse + classify + rapport, ZÉRO écriture en base.
# C'est la fenêtre de review : on lit pipeline/report.md AVANT tout seed réel.
npx tsx pipeline/ingest.ts --limit 50 --dry-run

# Seed réel (upsert idempotent — rejouable sans doublon)
npx tsx pipeline/ingest.ts                 # 1er run
npx tsx pipeline/ingest.ts --resume        # reprend au checkpoint (2e run = 0 inserted)

# Ajouter un anime précis (renfort manuel, ex. webtoons curatés)
npx tsx pipeline/ingest.ts --anime="Solo Leveling" --dry-run   # inspecter d'abord

# Vérification du pool importé (après seed réel uniquement)
npx tsx pipeline/verify.ts                 # exit 1 si un invariant échoue
```

Env (`.env` / `.env.local` ou shell) : `SUPABASE_URL` (ou
`NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY`. Inutile en dry-run.

## Stratégie de parcours

1. **Curseur global** : `characters(sort: FAVOURITES_DESC)` sans terme de
   recherche — les persos les plus populaires d'abord (meilleure qualité du
   pool). Si l'API le refuse → **repli automatique alphabétique** (a→z, lettre
   par lettre, checkpoint par lettre + page).
2. **`--anime="Titre"`** : media ANIME → personnages principaux (`role: MAIN`,
   25 max). Pour le renfort manuel des thèmes (webtoons, curations).
3. Rate limits respectés scrupuleusement : AniList 30 req/min (intervalle 2,1 s),
   Jikan ~3 req/s (intervalle 350 ms). Retries 429/5xx en backoff exponentiel +
   jitter ; circuit breaker (3 échecs → pause 60 s → checkpoint propre +
   exit code 1).

## Filtrage qualité (journalisé, exclusions minimales)

- media `isAdult` → ignorés pour la classification ; un perso dont TOUS les media
  sont adultes n'est **plus exclu** → importé untagged (`themes = '{}'`) ;
- sans image AniList ET sans fallback Jikan → exclu (`no_image`, structurel NOT NULL) ;
- nom vide → exclu (`no_name`, structurel NOT NULL) ;
- aucun thème applicable (`no_theme`) → **importé untagged** (décision V1
  orchestrateur : exclus = 0 ; les untagged servent le booster MIX "Tous les
  persos" et sont comptés + top 20 dans `report.md`).

## Classification (`classify.ts`, pure et testée)

| Thème | Règle |
|---|---|
| `shonen` | démo Shounen (Jikan) OU genre Action/Adventure OU liste curatée (Death Note, Haikyuu…) |
| `shojo` | démo Shoujo (Josei compte pour shojo) OU liste curatée (~30 titres : Cardcaptor Sakura, Fruits Basket…) |
| `seinen` | démo Seinen OU liste curatée (~30 titres : Berserk, Monster, Kaguya-sama…) |
| `isekai` | genre Isekai OU titre contenant "Isekai" OU synopsis avec transport/réincarnation **ET** "another world" (synopsis strict : évite les faux positifs type Death Note) |
| `webtoon` | media format MANGA/MANHWA/NOVEL ET `countryOfOrigin = "KR"` |
| `big3` | liste curatée : One Piece, Naruto/Boruto, Bleach (matching titre) |

Un personnage peut cumuler plusieurs thèmes (un perso Big 3 est aussi shonen).
**Démographies Jikan branchées en rescue ciblée** (décision post-dry-run) : pour chaque
perso exclu `no_theme` OU accepté sans shojo ni seinen, 1 appel `/anime?q=<titre>` résout
Shounen/Shoujo/Seinen/Josei. Le matching titre AniList→MAL est fuzzy : **chaque rescue est
listée dans `report.md` pour vérification humaine**. Si Jikan est injoignable, le rescue
dégrade en no-op (jamais bloquant).

## Rareté de base

6 tiers par percentiles de `favourites` sur le pool : top 1 % Mythic, 1→5 %
Legendary, 5→20 % Epic, 20→45 % Rare, 45→75 % Uncommon, reste Common
(`RARITY_THRESHOLDS` dans `classify.ts`). En fin d'ingestion **live**, un
recalcul global sur toute la table garantit la cohérence du pool final
(`recalculateRarities`, preserve `rarity_overridden = true`).

## Raretés manuelles (override)

Mettre à jour en base pour un perso précis :

```sql
update characters set base_rarity = 'mythic', rarity_overridden = true
where anilist_id = 12345;
```

Le pipeline ne recalcule JAMAIS un perso overridé (les upserts préservent
`base_rarity`).

## Fichiers

- `checkpoint.json` — curseur (gitignored, généré au run)
- `report.md` — rapport du dernier run / vérification (regénéré à chaque run)
- Tests : `npx vitest run pipeline/`
