/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Journal structuré du run : par personnage (statut + raison) + agrégats
 * (fetched / par thème / par rareté / exclusions). Génère `pipeline/report.md`
 * — LA fenêtre de review humaine avant tout seed massif (dry-run inclus).
 * ============================================================================
 */

import { writeFileSync } from 'node:fs';

import type { Rarity, ThemeSlug } from './types';

export type LineStatus = 'imported' | 'updated' | 'skipped' | 'excluded' | 'would-import';

export interface ReportLine {
  anilistId: number;
  name: string;
  favourites: number;
  rarity: Rarity | null;
  themes: ThemeSlug[];
  status: LineStatus;
  reason?: string; // ex. raison d'exclusion ('adult_media' | 'no_theme' | 'no_image' | 'no_name')
}

/** Correspondance démographique Jikan — à vérifier humainement (matching fuzzy). */
export interface RescueRecord {
  anilistId: number;
  name: string;
  queriedTitle: string;
  matchedTitle: string;
  demographics: string[];
  adoptedThemes: ThemeSlug[]; // thèmes ajoutés grâce à la résolution
}

export interface ReportOptions {
  mode: string; // ex. 'dry-run' | 'live'
  limit: number | null;
  cursorLabel: string;
  dbOutcome?: { inserted: number; updated: number; skippedOverridden: number };
  notes?: string[];
}

const THEME_LABELS: Record<ThemeSlug, string> = {
  shonen: 'Shonen',
  shojo: 'Shojo',
  seinen: 'Seinen',
  isekai: 'Isekai',
  webtoon: 'Webtoon',
  big3: 'Big 3',
};

export class Report {
  readonly lines: ReportLine[] = [];
  readonly rescues: RescueRecord[] = [];
  fetched = 0;

  add(line: ReportLine): void {
    this.lines.push(line);
  }

  addRescue(record: RescueRecord): void {
    this.rescues.push(record);
  }

  get accepted(): ReportLine[] {
    return this.lines.filter((l) => l.status !== 'excluded');
  }

  get excluded(): ReportLine[] {
    return this.lines.filter((l) => l.status === 'excluded');
  }

  toMarkdown(opts: ReportOptions): string {
    const accepted = this.accepted;
    const perTheme = new Map<ThemeSlug, number>();
    const perRarity = new Map<Rarity, number>();
    for (const line of accepted) {
      for (const t of line.themes) perTheme.set(t, (perTheme.get(t) ?? 0) + 1);
      if (line.rarity) perRarity.set(line.rarity, (perRarity.get(line.rarity) ?? 0) + 1);
    }

    const pct = (n: number, total: number): string => (total === 0 ? '0.0' : ((n / total) * 100).toFixed(1));

    const out: string[] = [];
    out.push('# MANGA SOCIETY — Rapport pipeline (characters)');
    out.push('');
    out.push(`- **Mode** : ${opts.mode}`);
    out.push(`- **Généré le** : ${new Date().toISOString()}`);
    out.push(`- **Limite** : ${opts.limit === null ? 'aucune' : opts.limit}`);
    out.push(`- **Curseur** : ${opts.cursorLabel}`);
    out.push(`- **Fetched (brut API)** : ${this.fetched}`);
    out.push(`- **Acceptés** : ${accepted.length} · **Exclus** : ${this.excluded.length}`);
    if (opts.dbOutcome) {
      out.push(
        `- **DB** : ${opts.dbOutcome.inserted} insérés · ${opts.dbOutcome.updated} mis à jour · ${opts.dbOutcome.skippedOverridden} préservés (rarity_overridden)`,
      );
    }
    out.push('');

    if (opts.notes && opts.notes.length > 0) {
      out.push('## Notes');
      for (const n of opts.notes) out.push(`- ${n}`);
      out.push('');
    }

    out.push('## Distribution par rareté (pool accepté)');
    out.push('');
    out.push('| Rareté | Nb | % |');
    out.push('|---|---:|---:|');
    for (const rarity of ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'] as Rarity[]) {
      const n = perRarity.get(rarity) ?? 0;
      out.push(`| ${rarity} | ${n} | ${pct(n, accepted.length)} |`);
    }
    out.push('');

    out.push('## Distribution par thème (un perso peut avoir plusieurs thèmes)');
    out.push('');
    out.push('| Thème | Nb |');
    out.push('|---|---:|');
    for (const slug of Object.keys(THEME_LABELS) as ThemeSlug[]) {
      out.push(`| ${THEME_LABELS[slug]} (\`${slug}\`) | ${perTheme.get(slug) ?? 0} |`);
    }
    out.push('');

    const mythics = accepted
      .filter((l) => l.rarity === 'mythic')
      .sort((a, b) => b.favourites - a.favourites)
      .slice(0, 20);
    if (mythics.length > 0) {
      out.push('## Top 20 mythic');
      out.push('');
      out.push('| # | Perso | Favourites | Thèmes |');
      out.push('|---:|---|---:|---|');
      mythics.forEach((l, i) => {
        out.push(`| ${i + 1} | ${l.name} (#${l.anilistId}) | ${l.favourites} | ${l.themes.join(', ')} |`);
      });
      out.push('');
    }

    out.push('## Détail des personnages acceptés');
    out.push('');
    out.push('| Perso | Fav | Rareté | Thèmes | Statut |');
    out.push('|---|---:|---|---|---|');
    for (const line of accepted) {
      out.push(
        `| ${line.name} (#${line.anilistId}) | ${line.favourites} | ${line.rarity ?? '—'} | ${line.themes.join(', ') || '—'} | ${line.status} |`,
      );
    }
    out.push('');

    out.push('## Exclusions (ce qu\'on a perdu et pourquoi)');
    out.push('');
    if (this.excluded.length === 0) {
      out.push('_Aucune exclusion._');
    } else {
      out.push('| Perso | Raison |');
      out.push('|---|---|');
      for (const line of this.excluded) {
        out.push(`| ${line.name} (#${line.anilistId}) | ${line.reason ?? 'inconnue'} |`);
      }
    }
    out.push('');

    if (this.rescues.length > 0) {
      out.push('## Résolutions démographiques Jikan (vérification humaine recommandée)');
      out.push('');
      out.push('Le matching titre AniList → titre MAL est fuzzy : chaque ligne indique ce qui a été requêté, ce que Jikan a matché, et les thèmes adoptés.');
      out.push('');
      out.push('| Perso | Requête | Match MAL | Démographies | Thèmes adoptés |');
      out.push('|---|---|---|---|---|');
      for (const r of this.rescues) {
        out.push(
          `| ${r.name} (#${r.anilistId}) | ${r.queriedTitle} | ${r.matchedTitle} | ${r.demographics.join(', ')} | ${r.adoptedThemes.join(', ') || 'aucun'} |`,
        );
      }
      out.push('');
    }
    return out.join('\n');
  }
}

export function writeReport(markdown: string, path = 'pipeline/report.md'): void {
  writeFileSync(path, markdown, 'utf8');
}
