/**
 * ============================================================================
 * scripts/smoke-engine.test.ts — SMOKE ENGINE (Agent A, tourne en CI via
 * `npm run test` = vitest run).
 *
 * Preuves exécutables de l'intégrité du moteur d'économie, SUR SUPABASE
 * LOCAL UNIQUEMENT (jamais la prod — standard commun n°7) :
 *
 *   1. 10 users virtuels ouvrent en PARALLÈLE → 0 print dupliqué
 *      (character_id, print_number), 0 compteur négatif, drops_log complet ;
 *   2. MÊME idempotency_key ×3 → 1 seul débit, résultat stocké rejoué ;
 *   3. Pity : 25 ouvertures sans L naturel → ≥1 L garantie ; 200 → ≥1 M ;
 *   4. Booster doré : exactement tous les 10 ;
 *   5. Daily pack : strictement 1/jour (ALREADY_CLAIMED), Épique minimum,
 *      gratuit, idempotent par clé ;
 *   6. Booster premium : 10 points, 1 carte jamais sous Légendaire
 *      (roll 85 % L / 15 % M), NOT_ENOUGH_POINTS sinon ;
 *   7. Burn : ownership ('NOT_OWNER'), crédit chakra, idempotence par clé.
 *
 * Prérequis : `supabase start` + `supabase db reset` (migrations + seed).
 * Env       : SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) +
 *             SUPABASE_SERVICE_ROLE_KEY, depuis l'environnement ou un
 *             fichier .env / .env.local à la racine (process.loadEnvFile).
 *
 * SÉCURITÉ — LOCAL UNIQUEMENT (SPEC §8 : jamais la prod pour les tests) :
 * le bloc describe est SKIPpé à moins que l'URL cible soit localhost /
 * 127.0.0.1, ou que l'override explicite SMOKE_ENGINE_ALLOW_REMOTE=1 soit
 * positionné (usage : projet de staging dédié, jetable). Sans Docker local
 * ni override, `npm run test` skippe proprement ces 8 scénarios (les tests
 * unitaires des autres agents, eux, tournent toujours).
 *
 * Les appels se font via le client service role directement sur les RPC
 * (couche HTTP Next non requise : l'atomicité à prouver vit en SQL). Les
 * fixtures (création d'users/persos, recharges de stock) passent par le
 * service role en dehors de l'économie — l'économie elle-même n'est
 * JAMAIS écrite directement : cartes, chakra, points, pity passent
 * exclusivement par les RPC (recharge comprise : refillStock ancre
 * last_booster_recharge dans le passé pour laisser la RPC créditer le
 * stock due, cap 10 — logique de recharge réelle exercée, pas contournée).
 * ============================================================================
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

// --- Env (silencieux si absent : les tests se skipent) ----------------------
for (const envFile of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // pas de fichier : on se fie à l'environnement du process
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Garde local-only : la prod/cloud n'est JAMAIS une cible de test. */
function isLocalTarget(url: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]'
    );
  } catch {
    return false;
  }
}

const IS_CONFIGURED =
  Boolean(SUPABASE_URL && SERVICE_ROLE_KEY) &&
  (isLocalTarget(SUPABASE_URL) || process.env.SMOKE_ENGINE_ALLOW_REMOTE === '1');

type Admin = SupabaseClient<Database>;

// --- Types locaux des résultats RPC -----------------------------------------
interface GrantedCard {
  card_id: string;
  character_id: string;
  name_romaji: string;
  anime_title: string | null;
  rarity: string;
  print_number: number;
  first_owner: boolean;
}

interface OpenResult {
  cards: GrantedCard[];
  is_golden: boolean;
  booster_count: number;
  pity_legendary: number;
  pity_mythic: number;
  golden_counter: number;
  premium_points: number;
  chakra: number;
  cards_obtained_count: number;
  theme_slug?: string;
}

const RARITIES_ORDERED = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
] as const;

/** Poids forçant l'absence de L/M naturels : la seule source de L/M = le pity. */
const NO_LM_WEIGHTS = { common: 100 };

/** Jour de run : suffixe des emails/anilist_id → re-jouable sans db reset. */
const RUN_ID = Date.now().toString(36);
const ANILIST_BASE = 9_100_000;
const USER_COUNT = 10;

let admin: Admin;
const userIds: string[] = [];

function freshKey(): string {
  return crypto.randomUUID();
}

function asOpenResult(data: unknown): OpenResult {
  return data as OpenResult;
}

async function rpcOpen(
  userId: string,
  themeSlug: string,
  weights?: Record<string, number>,
): Promise<OpenResult> {
  const { data, error } = await admin.rpc('open_booster', {
    p_user: userId,
    p_theme_slug: themeSlug,
    p_idempotency_key: freshKey(),
    ...(weights ? { p_weights: weights } : {}),
  });
  expect(error).toBeNull();
  return asOpenResult(data);
}

/**
 * Réapprovisionne le stock de boosters SANS écrire l'économie : ancre
 * last_booster_recharge dans le lointain passé → la RPC open_booster
 * crédite TOUTES les recharges dues (cap 10) via sa propre logique.
 */
async function refillStock(userId: string): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .update({ last_booster_recharge: '2000-01-01T00:00:00Z' })
    .eq('id', userId);
  expect(error).toBeNull();
}

/** Ouvre n boosters pour un user en rechargeant le stock quand nécessaire. */
async function openMany(
  userId: string,
  themeSlug: string,
  count: number,
  weights?: Record<string, number>,
): Promise<OpenResult[]> {
  const results: OpenResult[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 9 === 0) await refillStock(userId);
    results.push(await rpcOpen(userId, themeSlug, weights));
  }
  return results;
}

// --- Fixtures ----------------------------------------------------------------

beforeAll(async () => {
  if (!IS_CONFIGURED) {
    if (SUPABASE_URL && SERVICE_ROLE_KEY && !isLocalTarget(SUPABASE_URL)) {
      console.warn(
        `[smoke-engine] Cible non locale (${new URL(SUPABASE_URL).host}) — ` +
          'scénarios SKIPpés (SPEC §8 : jamais la prod pour les tests). ' +
          'Lancez `supabase start` + `supabase db reset` pour les exécuter.',
      );
    }
    return;
  }
  admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Thèmes : fournis par le seed 0002 — exigence dure, pas de contournement
  //    (deny-by-default : le service_role n'a pas d'INSERT sur themes).
  const { count: themeCount, error: themeError } = await admin
    .from('themes')
    .select('slug', { count: 'exact', head: true });
  if (themeError || !themeCount) {
    throw new Error(
      '[smoke-engine] Thèmes absents — appliquez le seed 0002 ' +
        '(`supabase db reset`). Détail : ' + (themeError?.message ?? 'count=0'),
    );
  }

  // 2. Pool de test : 2 persos par (rareté × thème) = 72 persos → rolls
  //    variés, unicité des prints testée y compris sur un même perso.
  const rows = RARITIES_ORDERED.flatMap((rarity, ri) =>
    ['shonen', 'shojo', 'webtoon', 'big3', 'seinen', 'isekai'].flatMap(
      (theme, ti) => [0, 1].map((n) => ({
        anilist_id: ANILIST_BASE + ri * 100 + ti * 10 + n,
        name_romaji: `Smoke ${rarity} ${theme} ${n}`,
        anime_title: `Smoke ${theme}`,
        favourites: 1000 + ri,
        base_rarity: rarity,
        themes: [theme],
        image_url: 'https://placehold.co/300x420/111827/94a3b8?text=Smoke',
        image_url_fallback: null,
      })),
    ),
  );
  const { error: charError } = await admin
    .from('characters')
    .upsert(rows, { onConflict: 'anilist_id' });
  expect(charError).toBeNull();

  // 3. 18 users virtuels (10 parallèles + 1 par scénario dédié).
  for (let i = 0; i < USER_COUNT + 8; i++) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `smoke-${RUN_ID}-${i}@manga-society.local`,
      password: 'smoke-password-1234',
      email_confirm: true,
      user_metadata: { username: `smoke_${RUN_ID}_${i}` },
    });
    expect(error).toBeNull();
    const id = data.user?.id;
    expect(id).toBeTruthy();
    userIds.push(id as string);
  }

  // 4. Profils créés par trigger handle_new_user ; insertion défensive si
  //    un trigger est manquant (fixture hors économie).
  const { data: profiles } = await admin
    .from('profiles')
    .select('id')
    .in('id', userIds);
  const found = new Set((profiles ?? []).map((p) => p.id));
  for (const id of userIds) {
    if (!found.has(id)) {
      const { error } = await admin.from('profiles').insert({ id });
      expect(error).toBeNull();
    }
  }
});

afterAll(async () => {
  if (!IS_CONFIGURED || !admin) return;
  // Suppression en cascade (profiles → user_cards → drops_log…).
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
  await admin
    .from('characters')
    .delete()
    .gte('anilist_id', ANILIST_BASE)
    .lt('anilist_id', ANILIST_BASE + 1_000);
});

// --- Tests --------------------------------------------------------------------

describe.skipIf(!IS_CONFIGURED)('smoke-engine — intégrité économique (Supabase local)', () => {
  it('10 users en parallèle : 0 print dupliqué, compteurs sains, drops_log complet', async () => {
    const parallel = userIds.slice(0, USER_COUNT);
    await Promise.all(parallel.map((id) => refillStock(id)));

    const marker = new Date().toISOString();
    const results = await Promise.all(
      parallel.map((id, i) =>
        rpcOpen(id, ['shonen', 'shojo', 'webtoon', 'big3', 'seinen', 'isekai'][i % 6]),
      ),
    );

    // 10 ouvertures × 5 cartes, toutes réussies.
    expect(results).toHaveLength(USER_COUNT);
    for (const r of results) expect(r.cards).toHaveLength(5);

    // 0 print dupliqué sur LES 50 CARTES DU TEST. Le filtre user est
    // obligatoire : les autres fichiers de test tournent en parallèle
    // (forks vitest) et insèrent leurs propres cartes dans la même fenêtre
    // temporelle — sans ce filtre le compte global dépend des autres workers
    // (échec CI 2026-10-12 : 65 reçus = 50 + 15 cartes d'autres fichiers).
    // L'unicité reste le filet ultime : toute collision de print sur ces
    // 50 cartes échoue ligne par ligne ci-dessous.
    const { data: dupes } = await admin
      .from('user_cards')
      .select('character_id, print_number')
      .in('user_id', parallel)
      .gte('obtained_at', marker);
    const seen = new Set<string>();
    for (const row of dupes ?? []) {
      const k = `${row.character_id}#${row.print_number}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    expect(seen.size).toBe(USER_COUNT * 5);

    // drops_log complet : 50 lignes pour ces users depuis le marqueur.
    const { count: drops } = await admin
      .from('drops_log')
      .select('id', { count: 'exact', head: true })
      .in('user_id', parallel)
      .gte('created_at', marker);
    expect(drops).toBe(USER_COUNT * 5);

    // Compteurs jamais négatifs, toujours dans leurs bornes.
    const { data: profiles } = await admin
      .from('profiles')
      .select(
        'id, chakra, premium_points, booster_count, cards_obtained_count, pity_legendary, pity_mythic, golden_counter',
      )
      .in('id', parallel);
    for (const p of profiles ?? []) {
      expect(p.chakra).toBeGreaterThanOrEqual(0);
      expect(p.premium_points).toBeGreaterThanOrEqual(0);
      expect(p.booster_count).toBeGreaterThanOrEqual(0);
      expect(p.booster_count).toBeLessThanOrEqual(10);
      expect(p.pity_legendary).toBeGreaterThanOrEqual(0);
      expect(p.pity_legendary).toBeLessThanOrEqual(25);
      expect(p.pity_mythic).toBeGreaterThanOrEqual(0);
      expect(p.pity_mythic).toBeLessThanOrEqual(200);
      expect(p.golden_counter).toBeGreaterThanOrEqual(0);
      expect(p.golden_counter).toBeLessThanOrEqual(9);
    }

    // cards_obtained_count exact par user (5 cartes chacun).
    const { data: cardCounts } = await admin
      .from('user_cards')
      .select('user_id')
      .in('user_id', parallel);
    const byUser = new Map<string, number>();
    for (const c of cardCounts ?? []) {
      byUser.set(c.user_id, (byUser.get(c.user_id) ?? 0) + 1);
    }
    for (const p of profiles ?? []) {
      expect(byUser.get(p.id)).toBe(p.cards_obtained_count);
    }
  });

  it('idempotence : MÊME clé ×3 → 1 seul débit, résultat stocké rejoué', async () => {
    const user = userIds[USER_COUNT];
    await refillStock(user);
    const { data: before } = await admin
      .from('profiles')
      .select('booster_count, cards_obtained_count')
      .eq('id', user)
      .single();
    const stockBefore = before?.booster_count ?? -1;

    const key = freshKey();
    const r1 = await admin.rpc('open_booster', {
      p_user: user,
      p_theme_slug: 'shonen',
      p_idempotency_key: key,
    });
    expect(r1.error).toBeNull();
    const r2 = await admin.rpc('open_booster', {
      p_user: user,
      p_theme_slug: 'shonen',
      p_idempotency_key: key,
    });
    expect(r2.error).toBeNull();
    const r3 = await admin.rpc('open_booster', {
      p_user: user,
      p_theme_slug: 'shonen',
      p_idempotency_key: key,
    });
    expect(r3.error).toBeNull();

    // Même résultat stocké pour les 3 appels.
    expect(asOpenResult(r2.data)).toEqual(asOpenResult(r1.data));
    expect(asOpenResult(r3.data)).toEqual(asOpenResult(r1.data));

    // Exactement 1 débit.
    const { data: after } = await admin
      .from('profiles')
      .select('booster_count, cards_obtained_count')
      .eq('id', user)
      .single();
    expect(stockBefore - (after?.booster_count ?? 0)).toBe(1);
    expect(after?.cards_obtained_count).toBe(5);
  });

  it('pity Légendaire : 25 ouvertures sans L naturel → ≥1 L garantie', async () => {
    const user = userIds[USER_COUNT + 1];
    const results = await openMany(user, 'shonen', 25, NO_LM_WEIGHTS);
    const legendary = results.flatMap((r) => r.cards).filter((c) => c.rarity === 'legendary');
    expect(legendary.length).toBeGreaterThanOrEqual(1);
    // Le L provient du pity : aucune chance naturelle (poids L = 0).
  });

  it('pity Mythique : 200 ouvertures → ≥1 M garantie', async () => {
    const user = userIds[USER_COUNT + 2];
    const results = await openMany(user, 'shonen', 200, NO_LM_WEIGHTS);
    const mythics = results.flatMap((r) => r.cards).filter((c) => c.rarity === 'mythic');
    expect(mythics.length).toBeGreaterThanOrEqual(1);
  });

  it('booster doré : exactement toutes les 10 ouvertures', async () => {
    const user = userIds[USER_COUNT + 3];
    const results = await openMany(user, 'seinen', 20, NO_LM_WEIGHTS);
    const goldenFlags = results.map((r) => r.is_golden);
    const expected = Array.from({ length: 20 }, (_, i) => (i + 1) % 10 === 0);
    expect(goldenFlags).toEqual(expected);
  });

  it('daily pack : strictement 1/jour, Épique minimum, gratuit, idempotent par clé', async () => {
    const user = userIds[USER_COUNT + 4];
    await refillStock(user);

    const { data: p0 } = await admin
      .from('profiles')
      .select('premium_points, booster_count')
      .eq('id', user)
      .single();
    const key = freshKey();

    const d1 = await admin.rpc('claim_daily_pack', {
      p_user: user,
      p_idempotency_key: key,
    });
    expect(d1.error).toBeNull();
    const res1 = d1.data as unknown as { cards: GrantedCard[]; theme_slug: string };
    expect(res1.cards).toHaveLength(5);
    for (const c of res1.cards) {
      expect(['epic', 'legendary', 'mythic']).toContain(c.rarity);
    }

    // Même clé → même résultat stocké, pas de second claim.
    const d2 = await admin.rpc('claim_daily_pack', {
      p_user: user,
      p_idempotency_key: key,
    });
    expect(d2.error).toBeNull();
    expect(d2.data).toEqual(d1.data);

    // Nouvelle clé → ALREADY_CLAIMED (strict 1/jour).
    const d3 = await admin.rpc('claim_daily_pack', {
      p_user: user,
      p_idempotency_key: freshKey(),
    });
    expect(d3.error).not.toBeNull();
    expect(String(d3.error?.message)).toContain('ALREADY_CLAIMED');

    // Gratuit : ni booster, ni point consommé.
    const { data: p1 } = await admin
      .from('profiles')
      .select('premium_points, booster_count')
      .eq('id', user)
      .single();
    expect(p1?.premium_points).toBe(p0?.premium_points);
    expect(p1?.booster_count).toBe(p0?.booster_count);
  });

  it('booster premium : 10 points, 1 carte Légendaire minimum (85/15)', async () => {
    const user = userIds[USER_COUNT + 5];
    // Fixture hors économie : crédit de points de test (la RPC fait le débit).
    const { error: grantError } = await admin
      .from('profiles')
      .update({ premium_points: 10 })
      .eq('id', user);
    expect(grantError).toBeNull();

    const { data, error } = await admin.rpc('open_premium_booster', {
      p_user: user,
      p_idempotency_key: freshKey(),
    });
    expect(error).toBeNull();
    const res = asOpenResult(data);
    // UNE carte (pas 5), jamais sous Légendaire (roll interne 85 L / 15 M).
    expect(res.cards).toHaveLength(1);
    expect(['legendary', 'mythic']).toContain(res.cards[0]?.rarity);
    expect(res.premium_points).toBe(0);

    // Solde insuffisant → NOT_ENOUGH_POINTS.
    const again = await admin.rpc('open_premium_booster', {
      p_user: user,
      p_idempotency_key: freshKey(),
    });
    expect(again.error).not.toBeNull();
    expect(String(again.error?.message)).toContain('NOT_ENOUGH_POINTS');
  });

  it('burn : ownership, crédit chakra exact, idempotence par clé', async () => {
    const burner = userIds[USER_COUNT + 6];
    const other = userIds[USER_COUNT + 7];
    await refillStock(burner);
    await refillStock(other);
    await rpcOpen(burner, 'isekai');
    await rpcOpen(other, 'isekai');

    const { data: myCard } = await admin
      .from('user_cards')
      .select('id')
      .eq('user_id', burner)
      .limit(1)
      .single();
    const { data: otherCard } = await admin
      .from('user_cards')
      .select('id')
      .eq('user_id', other)
      .limit(1)
      .single();
    expect(myCard?.id).toBeTruthy();
    expect(otherCard?.id).toBeTruthy();

    // Ownership : brûler la carte d'un autre → NOT_OWNER.
    const foreign = await admin.rpc('burn_card', {
      p_user: burner,
      p_card_id: otherCard?.id as string,
      p_idempotency_key: freshKey(),
    });
    expect(foreign.error).not.toBeNull();
    expect(String(foreign.error?.message)).toContain('NOT_OWNER');

    // Burn réel : crédit = chakra_gained, solde cohérent.
    const { data: p0 } = await admin
      .from('profiles')
      .select('chakra')
      .eq('id', burner)
      .single();
    const key = freshKey();
    const b1 = await admin.rpc('burn_card', {
      p_user: burner,
      p_card_id: myCard?.id as string,
      p_idempotency_key: key,
    });
    expect(b1.error).toBeNull();
    const r1 = b1.data as { chakra_gained: number; new_balance: number };
    expect(r1.chakra_gained).toBeGreaterThanOrEqual(5);
    expect(r1.new_balance).toBe((p0?.chakra ?? -1) + r1.chakra_gained);

    // Idempotence : même clé → même résultat, aucun crédit supplémentaire.
    const b2 = await admin.rpc('burn_card', {
      p_user: burner,
      p_card_id: myCard?.id as string,
      p_idempotency_key: key,
    });
    expect(b2.error).toBeNull();
    expect(b2.data).toEqual(b1.data);
    const { data: p1 } = await admin
      .from('profiles')
      .select('chakra')
      .eq('id', burner)
      .single();
    expect(p1?.chakra).toBe(r1.new_balance);

    // La carte est bien supprimée.
    const { data: gone } = await admin
      .from('user_cards')
      .select('id')
      .eq('id', myCard?.id as string)
      .maybeSingle();
    expect(gone).toBeNull();
  });
});
