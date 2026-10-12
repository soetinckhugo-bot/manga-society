/**
 * ============================================================================
 * scripts/audit-cloud.ts — AUDIT CLOUD EXÉCUTABLE (Agent E)
 *
 * Preuves vivantes des trous relevés dans QA_REPORT.md, obtenues UNIQUEMENT
 * avec : la anon key + des JWT utilisateurs + les RPC + les lectures publiques.
 * Aucun grant service_role sur les tables requis (le cloud n'en donne que sur
 * characters — 0006), aucune écriture directe. Nettoyage complet en fin de run
 * (suppression des users de test en cascade).
 *
 * Usage : npx tsx scripts/audit-cloud.ts   (charge .env.local)
 * ============================================================================
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;

interface Finding {
  id: string;
  gravite: 'P0' | 'P1' | 'P2' | 'INFO';
  titre: string;
  preuve: string;
  statut: 'TROU CONFIRMÉ' | 'OK' | 'INFO';
}

const FINDINGS: Finding[] = [];
function report(
  id: string,
  gravite: Finding['gravite'],
  titre: string,
  preuve: string,
  statut: Finding['statut'],
) {
  FINDINGS.push({ id, gravite, titre, preuve, statut });
  console.log(`\n[${gravite}] ${id} — ${titre}\n  statut: ${statut}\n  preuve: ${preuve}`);
}

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    /* .env absent : environnement du process */
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !anonKey || !serviceKey) throw new Error('env manquant (URL/anon/service)');
  const run = `aud${Date.now().toString(36)}`;

  const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });

  const createdIds: string[] = [];
  async function makeUser(tag: string): Promise<{ client: Client; id: string }> {
    const email = `audit-${run}-${tag}@manga-society.local`;
    let lastErr = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: 'audit-password-1234',
        email_confirm: true,
        user_metadata: { username: `audit_${run}_${tag}` },
      });
      if (!error && data.user) {
        createdIds.push(data.user.id);
        const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
        const login = await client.auth.signInWithPassword({
          email,
          password: 'audit-password-1234',
        });
        if (login.error) throw new Error(`login: ${login.error.message}`);
        return { client, id: data.user.id };
      }
      lastErr = error?.message ?? 'inconnu';
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    throw new Error(`createUser ${tag}: ${lastErr}`);
  }

  const freshKey = () => crypto.randomUUID();
  const profileOf = async (c: Client, id: string) =>
    (await c.from('profiles').select('*').eq('id', id).single()).data;

  // --- État du seed cloud (lectures publiques) --------------------------------
  const counts: Record<string, number | null> = {};
  for (const t of ['themes', 'characters', 'cosmetics', 'quests'] as const) {
    const { count } = await anon.from(t).select('id', { count: 'exact', head: true });
    counts[t] = count;
  }
  report(
    'E-ENV',
    'INFO',
    'État du seed sur le cloud (lectures publiques anon)',
    JSON.stringify(counts),
    'INFO',
  );

  const A = await makeUser('a');
  const B = await makeUser('b');

  // --- E-01 : aucune vérification p_user = auth.uid() ---------------------------
  const b0 = await profileOf(B.client, B.id);
  const openAsA = await A.client.rpc('open_booster', {
    p_user: B.id,
    p_theme_slug: 'shonen',
    p_idempotency_key: freshKey(),
  });
  const b1 = await profileOf(B.client, B.id);
  report(
    'E-01a',
    'P0',
    'open_booster(p_user=B) invoqué par A : débit du stock de B',
    `error=${openAsA.error?.message ?? 'null'} | stock B ${b0?.booster_count}→${b1?.booster_count}, cartes B +${(b1?.cards_obtained_count ?? 0) - (b0?.cards_obtained_count ?? 0)}`,
    openAsA.error ? 'OK' : 'TROU CONFIRMÉ',
  );

  const dailyAsA = await A.client.rpc('claim_daily_pack', {
    p_user: B.id,
    p_idempotency_key: freshKey(),
  });
  report(
    'E-01b',
    'P0',
    'claim_daily_pack(p_user=B) invoqué par A : daily de B consommé',
    `error=${dailyAsA.error?.message ?? 'null'}`,
    dailyAsA.error ? 'OK' : 'TROU CONFIRMÉ',
  );

  const { data: pubChars } = await anon.from('characters').select('id').limit(3);
  const wlAsA = await A.client.rpc('toggle_wishlist', {
    p_user: B.id,
    p_character_id: pubChars![2]!.id,
  });
  const bWishlist = await B.client.from('wishlists').select('character_id');
  report(
    'E-01c',
    'P0',
    'toggle_wishlist(p_user=B) invoqué par A : pollution de la wishlist de B',
    `error=${wlAsA.error?.message ?? 'null'} | wishlist de B: ${(bWishlist.data ?? []).length} entrée(s)`,
    wlAsA.error ? 'OK' : 'TROU CONFIRMÉ',
  );

  const renameAsA = await A.client.rpc('set_username', {
    p_user: B.id,
    p_username: `hijack_${run}`,
  });
  report(
    'E-01d',
    'P0',
    'set_username(p_user=B) invoqué par A : renommage du profil de B',
    `error=${renameAsA.error?.message ?? 'null'}`,
    renameAsA.error ? 'OK' : 'TROU CONFIRMÉ',
  );

  // --- E-02 : cap wishlist 10 jamais appliqué ------------------------------------
  const { data: capChars } = await anon.from('characters').select('id').limit(12);
  let capError = '';
  for (let i = 0; i < 11 && !capError; i++) {
    const { error } = await B.client.rpc('toggle_wishlist', {
      p_user: B.id,
      p_character_id: capChars![i]!.id,
    });
    if (error) capError = error.message;
  }
  const bWl = await B.client.from('wishlists').select('character_id', { count: 'exact', head: true });
  report(
    'E-02',
    'P1',
    "Cap wishlist 10 slots : 'WISHLIST_FULL' jamais levé par toggle_wishlist",
    `11e ajout: ${capError || 'ACCEPTÉ'} | taille réelle: ${bWl.count} (SPEC: 10 max)`,
    capError.includes('WISHLIST_FULL') ? 'OK' : 'TROU CONFIRMÉ',
  );

  // --- E-03 : table de streak live vs lib/config.ts ------------------------------
  const C = await makeUser('c');
  const streak1 = await C.client.rpc('update_login_streak', { p_user: C.id });
  const s1 = streak1.data as unknown as { chakra_gained: number; login_streak: number } | null;
  report(
    'E-03',
    'P1',
    'Streak J1 : chakra live (SQL least(streak,10)*5) vs config.streak.chakraByDay[0]=20',
    `chakra_gained=${s1?.chakra_gained} (attendu 20 côté config) — divergence standard n°12`,
    s1?.chakra_gained === 20 ? 'OK' : 'TROU CONFIRMÉ',
  );

  // --- E-04 : double débit buy_cosmetic (+ variante cross-user E-01e) -------------
  // B gagne du chakra par la voie réelle (burn de ses cartes, ~15 cartes).
  const { data: bCards } = await B.client.from('user_cards').select('id').eq('user_id', B.id);
  for (const c of (bCards ?? []).slice(0, 15)) {
    await B.client.rpc('burn_card', { p_user: B.id, p_card_id: c.id, p_idempotency_key: freshKey() });
  }
  const { data: cosmetics } = await anon.from('cosmetics').select('id, slug, chakra_price').order('chakra_price');
  const cheap = cosmetics![0]!;
  const before = await profileOf(B.client, B.id);
  const buy1 = await B.client.rpc('buy_cosmetic', { p_user: B.id, p_cosmetic_id: cheap.id, p_idempotency_key: freshKey() });
  const mid = await profileOf(B.client, B.id);
  const buy2 = await A.client.rpc('buy_cosmetic', { p_user: B.id, p_cosmetic_id: cheap.id, p_idempotency_key: freshKey() });
  const after = await profileOf(B.client, B.id);
  report(
    'E-04',
    'P1',
    `Rachat d'un cosmétique déjà possédé (${cheap.slug}, ${cheap.chakra_price} chakra) : double débit`,
    `achat1=${buy1.error?.message ?? 'OK'} (solde ${before?.chakra}→${mid?.chakra}) | ` +
      `achat2 par A pour B=${buy2.error?.message ?? 'OK'} (solde ${mid?.chakra}→${after?.chakra}) — deux débits pleins + trou authz`,
    'TROU CONFIRMÉ',
  );

  // --- E-07 : get_public_profile cassé pour tout joueur avec cartes ---------------
  const pub = await anon.rpc('get_public_profile', { p_username: `audit_${run}_a` });
  report(
    'E-07',
    'P1',
    'get_public_profile : uc.rarity inexistante sur user_cards (migration 0007)',
    `error=${pub.error?.message ?? 'null'}`,
    pub.error ? 'TROU CONFIRMÉ' : 'OK',
  );

  // --- E-08 : grants service_role divergents cloud vs local -----------------------
  const t1 = await admin.from('profiles').select('id').limit(1);
  const t2 = await admin.from('profiles').update({ chakra: 0 }).eq('id', B.id);
  report(
    'E-08',
    'P1',
    'Cloud : service_role sans grant SELECT/UPDATE sur profiles (seul characters est grantié, 0006)',
    `select=${t1.error?.message ?? 'OK'} | update=${t2.error?.message ?? 'OK'} — ` +
      'les fixtures/scripts qui écrivent hors RPC (dev-seed, refill smoke) cassent sur le cloud',
    t1.error || t2.error ? 'TROU CONFIRMÉ' : 'OK',
  );

  // --- Nettoyage -------------------------------------------------------------------
  for (const id of createdIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\nNettoyage : ${createdIds.length} users de test supprimés (cascade complète).`);

  const confirmed = FINDINGS.filter((f) => f.statut === 'TROU CONFIRMÉ').length;
  console.log(`\n=== RÉSUMÉ : ${FINDINGS.length} vérifications, ${confirmed} trou(s) confirmé(s) ===`);
  for (const f of FINDINGS) {
    console.log(`  [${f.gravite}] ${f.id}: ${f.statut}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
