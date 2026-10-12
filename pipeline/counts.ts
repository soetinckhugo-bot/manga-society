import { createDbClient } from './db';

async function main(): Promise<void> {
  const db = createDbClient();

  const { count, error: countError } = await db.from('characters').select('*', { count: 'exact', head: true });
  if (countError) console.error('count error:', countError.message);
  console.log('characters en base:', count);

  const rows: Array<{ base_rarity: string; themes: string[] }> = [];
  const PAGE = 1_000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('characters')
      .select('base_rarity, themes')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`select: ${error.message}`);
    const batch = (data ?? []) as Array<{ base_rarity: string; themes: string[] }>;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const dist: Record<string, number> = {};
  const themes: Record<string, number> = {};
  let untagged = 0;
  for (const r of rows) {
    dist[r.base_rarity] = (dist[r.base_rarity] ?? 0) + 1;
    if (!r.themes || r.themes.length === 0) untagged += 1;
    for (const t of r.themes ?? []) themes[t] = (themes[t] ?? 0) + 1;
  }
  console.log('distribution raretés:', JSON.stringify(dist));
  console.log('par thème:', JSON.stringify(themes));
  console.log('untagged (themes vide):', untagged, '/ total', rows.length);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
