/**
 * PONCTUEL (Agent E) — purge des fixtures QA restées sur le cloud après les
 * audits : le grant 0006 n'accorde pas DELETE sur characters au service_role.
 * Repli de containment : vider `themes` (plus jamais tirées par un booster).
 * La suppression physique = dette à trancher par l'Agent 0 (cf. QA_REPORT).
 * Usage : npx tsx scripts/purge-cloud-fixtures.ts
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const r = await admin
    .from('characters')
    .update({ themes: [] })
    .gte('anilist_id', 9_200_000)
    .lt('anilist_id', 9_201_000);
  console.log('themes vidés sur les fixtures:', r.error ? r.error.message : 'OK');

  const { count } = await admin
    .from('characters')
    .select('id', { count: 'exact', head: true })
    .gte('anilist_id', 9_200_000)
    .lt('anilist_id', 9_201_000);
  console.log('fixtures restantes (hors pool de tirage):', count);

  const users = await admin.auth.admin.listUsers({ perPage: 100 });
  const qa = (users.data.users ?? [])
    .map((u) => u.email ?? '')
    .filter((e) => e.startsWith('qa-') || e.startsWith('smoke-'));
  console.log('users qa/smoke restants:', qa.length ? qa : 'aucun');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
