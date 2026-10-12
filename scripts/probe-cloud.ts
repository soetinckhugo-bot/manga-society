/**
 * Probe cloud READ-ONLY — vérifie la présence des RPC et le contenu de base
 * SANS aucune mutation (aucun appel de mutation économique, aucune écriture).
 * Usage : npx tsx scripts/probe-cloud.ts   (charge .env.local)
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  for (const f of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* absent */
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('env manquant');

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { count: themes } = await admin.from('themes').select('slug', { count: 'exact', head: true });
  const { count: chars } = await admin.from('characters').select('id', { count: 'exact', head: true });
  const { count: quests } = await admin.from('quests').select('id', { count: 'exact', head: true });
  const { count: cosmetics } = await admin.from('cosmetics').select('id', { count: 'exact', head: true });
  console.log({ themes, chars, quests, cosmetics });

  // Présence RPC : get_booster_state sur un uuid aléatoire → PROFILE_NOT_FOUND attendu.
  const { error: stateErr } = await admin.rpc('get_booster_state', {
    p_user: crypto.randomUUID(),
  });
  console.log('get_booster_state:', stateErr ? `ERREUR: ${stateErr.message}` : 'OK (rpc présente)');

  // Présence des mutations : profil inexistant → PROFILE_NOT_FOUND attendu
  // (prouve la fonction présente SANS débiter quoi que ce soit).
  const { error: openErr } = await admin.rpc('open_booster', {
    p_user: crypto.randomUUID(),
    p_theme_slug: 'shonen',
    p_idempotency_key: crypto.randomUUID(),
  });
  console.log('open_booster:', openErr ? `ERREUR: ${openErr.message.slice(0, 120)}` : 'OK inattendu');

  const { error: streakErr } = await admin.rpc('update_login_streak', {
    p_user: crypto.randomUUID(),
  });
  console.log('update_login_streak:', streakErr ? `ERREUR: ${streakErr.message.slice(0, 120)}` : 'OK inattendu');

  const { error: toggleErr } = await admin.rpc('toggle_wishlist', {
    p_user: crypto.randomUUID(),
    p_character_id: crypto.randomUUID(),
  });
  console.log('toggle_wishlist:', toggleErr ? `ERREUR: ${toggleErr.message.slice(0, 120)}` : 'OK inattendu');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
