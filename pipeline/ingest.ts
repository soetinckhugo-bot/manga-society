/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Orchestrateur CLI du pipeline :
 *
 *   npx tsx pipeline/ingest.ts [--dry-run] [--resume] [--limit=N] [--anime="Titre"]
 *
 * Flux : AniList (curseur global par favourites, repli alphabétique) → filtrage
 * qualité (adulte / sans image / sans nom → exclus, LOGUÉS) → fallback image
 * Jikan → classification des thèmes (classify.ts, pure) → rareté par percentiles
 * → upsert idempotent (anilist_id) ou rapport sec en --dry-run.
 * Résilience : rate limiter 30 req/min + retry backoff/jitter + circuit breaker ;
 * checkpoint après chaque page traitée → --resume sans doublon.
 * ============================================================================
 */

import { AniListClient, AniListError } from './anilist';
import { ALPHABET, FRESH_CHECKPOINT, loadCheckpoint, saveCheckpoint, type Checkpoint } from './checkpoint';
import { assignRarities, classifyCharacter } from './classify';
import { createDbClient, recalculateRarities, upsertCharacters } from './db';
import { JikanClient } from './jikan';
import { Report } from './report';
import type { CharacterCandidate, CharacterRow, RawCharacter, ThemeSlug } from './types';

const CHECKPOINT_PATH = 'pipeline/checkpoint.json';
const REPORT_PATH = 'pipeline/report.md';

interface CliOptions {
  dryRun: boolean;
  resume: boolean;
  limit: number | null;
  anime: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, resume: false, limit: null, anime: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--resume') opts.resume = true;
    else if (arg.startsWith('--limit=')) opts.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    else if (arg === '--limit') {
      i += 1;
      opts.limit = Number.parseInt(argv[i] ?? '', 10);
    } else if (arg.startsWith('--anime=')) opts.anime = arg.slice('--anime='.length);
    else if (arg === '--anime') {
      i += 1;
      opts.anime = argv[i] ?? null;
    }
  }
  if (opts.limit !== null && (!Number.isFinite(opts.limit) || opts.limit <= 0)) {
    throw new Error(`--limit invalide : ${opts.limit}`);
  }
  return opts;
}

/** Titre "principal" du perso : media ANIME non adulte prioritaire. */
function pickAnimeTitle(raw: RawCharacter): string | null {
  const media = raw.media.filter((m) => !m.isAdult);
  return (
    media.find((m) => m.format === 'ANIME' && m.titleRomaji)?.titleRomaji ??
    media.find((m) => m.titleRomaji)?.titleRomaji ??
    null
  );
}

function toRow(candidate: CharacterCandidate): CharacterRow {
  return {
    anilist_id: candidate.anilistId,
    name_romaji: candidate.nameRomaji,
    name_native: candidate.nameNative,
    image_url: candidate.imageUrlResolved,
    image_url_fallback: candidate.imageFallback,
    anime_title: candidate.animeTitle,
    favourites: candidate.favourites,
    base_rarity: candidate.rarity,
    rarity_overridden: false,
    themes: candidate.themes,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const anilist = new AniListClient();
  const jikan = new JikanClient();
  const report = new Report();
  const seen = new Set<number>();
  const candidates: CharacterCandidate[] = [];

  const reachedLimit = (): boolean => opts.limit !== null && candidates.length >= (opts.limit as number);

  /** Traite un brut : filtrage qualité → image → classification → candidat. */
  async function processRaw(raw: RawCharacter): Promise<void> {
    if (seen.has(raw.anilistId)) return; // doublon du run (recherche alphabétique qui se chevauche)
    seen.add(raw.anilistId);
    report.fetched += 1;

    const nameEmpty = raw.nameRomaji.trim().length === 0;
    if (nameEmpty) {
      report.add({
        anilistId: raw.anilistId,
        name: '(nom vide)',
        favourites: raw.favourites,
        rarity: null,
        themes: [],
        status: 'excluded',
        reason: 'no_name',
      });
      return;
    }

    // Image : AniList d'abord, fallback Jikan (best-effort, jamais bloquant).
    let fallback: string | null = null;
    if (raw.imageUrl === null) {
      fallback = await jikan.searchCharacterImage(raw.nameRomaji);
    }
    const resolved = raw.imageUrl ?? fallback;
    if (resolved === null) {
      report.add({
        anilistId: raw.anilistId,
        name: raw.nameRomaji,
        favourites: raw.favourites,
        rarity: null,
        themes: [],
        status: 'excluded',
        reason: 'no_image',
      });
      return;
    }

    const animeTitle = pickAnimeTitle(raw);
    let { themes, excludedReason } = classifyCharacter({ media: raw.media, demographics: raw.demographics });
    let finalThemes = themes as ThemeSlug[];
    let finalExcluded = excludedReason;

    // Rescue Jikan ciblée (décision post-dry-run) : shojo/seinen ne sont
    // détectables que par démographie explicite, qu'AniList ne fournit pas.
    // On tente pour les persos exclus 'no_theme' ET pour les acceptés dépourvus
    // de shojo ET de seinen (variété des pools). Best-effort, jamais bloquant ;
    // chaque correspondance est loguée pour vérification humaine (matching fuzzy).
    const lacksShojoSeinen = !finalThemes.includes('shojo') && !finalThemes.includes('seinen');
    if ((finalExcluded === 'no_theme' || (finalExcluded === null && lacksShojoSeinen)) && animeTitle !== null) {
      const match = await jikan.resolveDemographics(animeTitle);
      if (match) {
        const retry = classifyCharacter({ media: raw.media, demographics: match.demographics });
        const adopted = retry.themes.filter((t) => !finalThemes.includes(t)) as ThemeSlug[];
        if (retry.excludedReason === null && adopted.length > 0) {
          finalThemes = retry.themes as ThemeSlug[];
          finalExcluded = null;
        }
        report.addRescue({
          anilistId: raw.anilistId,
          name: raw.nameRomaji,
          queriedTitle: animeTitle,
          matchedTitle: match.matchedTitle,
          demographics: match.demographics,
          adoptedThemes: adopted,
        });
      }
    }

    // Exclusions "douces" (décision orchestrateur V1) : les untagged — y compris
    // les media 100 % adultes — ENTRENT en base avec themes '{}' (ils serviront
    // au booster MIX "Tous les persos"). Seules les exclusions structurelles
    // (NOT NULL : nom / image) restent dures.
    const SOFT_EXCLUSIONS: string[] = ['no_theme', 'adult_media'];
    if (finalExcluded !== null && !SOFT_EXCLUSIONS.includes(finalExcluded)) {
      report.add({
        anilistId: raw.anilistId,
        name: raw.nameRomaji,
        favourites: raw.favourites,
        rarity: null,
        themes: [],
        status: 'excluded',
        reason: finalExcluded,
      });
      return;
    }

    candidates.push({
      ...raw,
      imageUrlResolved: resolved,
      imageFallback: raw.imageUrl !== null ? fallback : null,
      animeTitle,
      themes: finalExcluded !== null ? [] : finalThemes, // untagged → '{}'
      rarity: 'common', // affectée par assignRarities sur le pool, plus bas
    });
  }

  // --------------------------------------------------------------------------
  // Phase 1 — collecte (API)
  // --------------------------------------------------------------------------
  if (opts.anime !== null) {
    // Mode ciblé : les personnages principaux d'un anime (--anime="Jujutsu Kaisen").
    const raws = await anilist.fetchCharactersByAnime(opts.anime);
    for (const raw of raws) {
      if (reachedLimit()) break;
      await processRaw(raw);
    }
  } else {
    // Mode parcours : curseur global (favourites desc) avec repli alphabétique.
    let cp: Checkpoint = opts.resume
      ? (loadCheckpoint(CHECKPOINT_PATH) ?? FRESH_CHECKPOINT)
      : FRESH_CHECKPOINT;

    let cursorLetter = cp.mode === 'alpha' ? (ALPHABET[cp.letterIndex] ?? 'a') : '';
    let page = cp.page;

    for (;;) {
      if (reachedLimit()) break;

      let result;
      try {
        result = await anilist.fetchCharactersPage(cursorLetter, page);
      } catch (err) {
        // Plafond dur d'AniList : 100 pages × 50 = 5 000 entrées max sur le
        // parcours global. Ce n'est PAS une erreur : c'est la fin du parcours.
        if (err instanceof AniListError && err.status === 400 && err.message.includes('Page depth exceeds')) {
          console.log('[ingest] fin du parcours global (plafond AniList de 5 000 entrées atteint).');
          saveCheckpoint(CHECKPOINT_PATH, cp);
          break;
        }
        // Circuit breaker / échec persistant : checkpoint propre + exit code explicite.
        saveCheckpoint(CHECKPOINT_PATH, cp);
        throw new Error(
          `[ingest] arrêt au curseur ${cp.mode === 'alpha' ? cursorLetter : '(global)'} p.${page} — ` +
            `${err instanceof Error ? err.message : String(err)}. Reprendre avec --resume.`,
        );
      }

      if (cp.mode === 'global' && page === 1 && result.characters.length === 0) {
        // Le parcours global ne renvoie rien → repli alphabétique (a→z).
        console.warn('[ingest] parcours global vide, repli alphabétique (a→z).');
        cp = { mode: 'alpha', letterIndex: 0, page: 1, updatedAt: '' };
        saveCheckpoint(CHECKPOINT_PATH, cp);
        cursorLetter = ALPHABET[0] as string;
        page = 1;
        continue;
      }

      for (const raw of result.characters) {
        if (reachedLimit()) break;
        await processRaw(raw);
      }

      // Curseur avancé UNIQUEMENT après traitement réussi de la page.
      if (reachedLimit()) {
        // Reprise future : page suivante de la lettre, ou lettre suivante si épuisée.
        if (cp.mode === 'alpha' && !result.hasNextPage) {
          cp.letterIndex += 1;
          cp.page = 1;
        } else {
          cp.page = page + 1;
        }
        saveCheckpoint(CHECKPOINT_PATH, cp);
        break;
      }
      if (!result.hasNextPage) {
        if (cp.mode === 'alpha') {
          cp.letterIndex += 1;
          if (cp.letterIndex >= ALPHABET.length) {
            saveCheckpoint(CHECKPOINT_PATH, cp); // parcours terminé
            break;
          }
          cp.page = 1;
          saveCheckpoint(CHECKPOINT_PATH, cp);
          cursorLetter = ALPHABET[cp.letterIndex] as string;
          page = 1;
          continue;
        }
        saveCheckpoint(CHECKPOINT_PATH, cp); // parcours global terminé
        break;
      }
      page += 1;
      cp = { ...cp, page, updatedAt: '' };
      saveCheckpoint(CHECKPOINT_PATH, cp);
    }
  }

  // --------------------------------------------------------------------------
  // Phase 2 — raretés par percentiles sur le pool accepté du run
  // --------------------------------------------------------------------------
  const rarities = assignRarities(candidates);
  for (const candidate of candidates) {
    candidate.rarity = rarities.get(candidate) ?? 'common';
    report.add({
      anilistId: candidate.anilistId,
      name: candidate.nameRomaji,
      favourites: candidate.favourites,
      rarity: candidate.rarity,
      themes: candidate.themes,
      status: opts.dryRun ? 'would-import' : 'imported',
    });
  }

  // --------------------------------------------------------------------------
  // Phase 3 — écriture (zéro en --dry-run : on ne touche JAMAIS à la base)
  // --------------------------------------------------------------------------
  let dbOutcome: { inserted: number; updated: number; skippedOverridden: number } | undefined;
  const notes: string[] = [];
  if (!opts.dryRun) {
    const db = createDbClient();
    dbOutcome = await upsertCharacters(db, candidates.map(toRow));
    // Le "pool final" = toute la table : recalcul global des raretés (idempotent,
    // preserve rarity_overridden). Les raretés du lot courant sont affinées ici.
    const rarityChanges = await recalculateRarities(db);
    notes.push(`Recalcul global des raretés : ${rarityChanges} ligne(s) mises à jour.`);
  } else {
    notes.push(
      'Mode --dry-run : aucune écriture en base. Raretés = percentiles du lot fetché ' +
        '(le run live recalcule sur tout le pool en fin d\'ingestion).',
    );
  }

  const cursorLabel =
    opts.anime !== null
      ? `--anime="${opts.anime}"`
      : (() => {
          const cp = loadCheckpoint(CHECKPOINT_PATH);
          return cp ? `${cp.mode === 'alpha' ? `lettre ${ALPHABET[cp.letterIndex]}` : 'global'} p.${cp.page}` : 'départ';
        })();

  const markdown = report.toMarkdown({
    mode: opts.dryRun ? 'dry-run (zéro écriture)' : 'live (upsert idempotent)',
    limit: opts.limit,
    cursorLabel,
    dbOutcome,
    notes,
  });
  const { writeReport } = await import('./report');
  writeReport(markdown, REPORT_PATH);

  // --------------------------------------------------------------------------
  // Synthèse stdout
  // --------------------------------------------------------------------------
  console.log(`[ingest] fetched=${report.fetched} acceptés=${candidates.length} exclus=${report.excluded.length}`);
  if (dbOutcome) {
    console.log(
      `[ingest] DB → inserted=${dbOutcome.inserted} updated=${dbOutcome.updated} overridden préservés=${dbOutcome.skippedOverridden}`,
    );
  }
  console.log(`[ingest] Rapport : ${REPORT_PATH}`);
  if (report.excluded.length > 0) {
    const reasons = new Map<string, number>();
    for (const line of report.excluded) reasons.set(line.reason ?? '?', (reasons.get(line.reason ?? '?') ?? 0) + 1);
    console.log(
      `[ingest] Exclusions : ${[...reasons.entries()].map(([r, n]) => `${r}=${n}`).join(' ')}`,
    );
  }
  if (report.rescues.length > 0) {
    console.log(`[ingest] Rescues Jikan : ${report.rescues.length} résolution(s) démographique(s) — vérifier dans le rapport.`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
