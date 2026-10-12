/**
 * ============================================================================
 * tests/concurrency.test.ts — TESTS DE CONCURRENCE Agent E (PROMPT E §1, P0)
 *
 *   1. Burn PENDANT des ouvertures simultanées (même user) : aucune corruption
 *      (chakra ≥ 0, 0 print dupliqué, cards_obtained_count == cartes réelles,
 *      drops_log complet, seules erreurs acceptables = NOT_OWNER).
 *   2. MÊME idempotency_key tirée 5× en parallèle : exactement 1 débit,
 *      résultat stocké rejoué (IDEMPOTENCY_IN_PROGRESS = erreur propre).
 *   3. Ouvertures massives parallèles sur UN perso unique (pool de 1) :
 *      60 ouvertures concurrentes → 60 prints distincts séquentiels.
 *   4. Recharge concurrente : N ouvertures simultanées après un refill →
 *      le débit conditionnel (booster_count > 0) ne passe jamais sous 0.
 *
 * Complète scripts/smoke-engine.test.ts (Agent A) sans le dupliquer.
 * Cible Supabase LOCAL (CI) ; SMOKE_ENGINE_ALLOW_REMOTE=1 pour audit cloud.
 * ============================================================================
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanup,
  createUsers,
  freshKey,
  IS_CONFIGURED,
  makeAdmin,
  pgError,
  refillStock,
  seedFixtureCharacters,
  ANILIST_BASE,
  type Admin,
} from './helpers';

interface GrantedCard {
  card_id: string;
  character_id: string;
  rarity: string;
  print_number: number;
}

interface OpenResult {
  cards: GrantedCard[];
  is_golden: boolean;
  booster_count: number;
  cards_obtained_count: number;
  pity_legendary: number;
  pity_mythic: number;
  golden_counter: number;
  chakra: number;
  premium_points: number;
}

let admin: Admin;
let userIds: string[] = [];

async function rpcOpenRaw(user: string, theme: string, key: string, weights?: Record<string, number>) {
  return admin.rpc('open_booster', {
    p_user: user,
    p_theme_slug: theme,
    p_idempotency_key: key,
    ...(weights ? { p_weights: weights } : {}),
  });
}

async function profile(user: string) {
  const { data } = await admin
    .from('profiles')
    .select('chakra, booster_count, cards_obtained_count, premium_points')
    .eq('id', user)
    .single();
  return data!;
}

describe.skipIf(!IS_CONFIGURED)('concurrency — P0 (burn pendant ouverture, même clé, pool unique)', () => {
  beforeAll(async () => {
    admin = makeAdmin();
    await seedFixtureCharacters(admin);
    userIds = await createUsers(admin, 4);
  });

  afterAll(async () => {
    await cleanup(admin, userIds);
  });

  it('burn pendant ouvertures parallèles : aucune corruption économique', async () => {
    const user = userIds[0]!;
    await refillStock(admin, user);
    // Solde de référence (les burns créditent du chakra).
    const chakraBefore = (await profile(user)).chakra;

    const ACCEPTED = /NOT_OWNER|NO_BOOSTER/;
    // NOTE 0008 : le filtre temporel `.gte(created_at, marker)` a été SUPPRIMÉ
    // — l'horloge du serveur cloud est derrière l'horloge client (skew NTP
    // observé ~0,4 s et par à-coups sous Windows), ce qui faussait le
    // comptage. Le user est créé par ce test (beforeAll) : 100 % de ses
    // lignes user_cards / drops_log appartiennent à ce scénario, l' isolation
    // par user suffit. Cf. QA_REPORT.

    // 1 worker burn : poll les cartes du user et les brûle au fil de l'eau.
    const burnedIds = new Set<string>();
    let burnErrors = 0;
    const burnLoop = (async () => {
      for (let round = 0; round < 200; round++) {
        const { data: cards } = await admin
          .from('user_cards')
          .select('id')
          .eq('user_id', user)
          .limit(25);
        const fresh = (cards ?? []).filter((c) => !burnedIds.has(c.id));
        if (fresh.length === 0) {
          if (round > 30) break; // plus rien à brûler et les opens ont eu le temps
          await new Promise((r) => setTimeout(r, 25));
          continue;
        }
        const res = await Promise.all(
          fresh.slice(0, 5).map((c) =>
            admin.rpc('burn_card', {
              p_user: user,
              p_card_id: c.id,
              p_idempotency_key: freshKey(),
            }),
          ),
        );
        for (let i = 0; i < res.length; i++) {
          if (res[i]!.error) {
            // Deux burns concurrents de la MÊME carte : l'un gagne, l'autre NOT_OWNER.
            if (!ACCEPTED.test(pgError(res[i]!.error))) burnErrors += 1;
          } else {
            burnedIds.add(fresh[i]!.id);
          }
        }
      }
    })();

    // 10 ouvertures en parallèle (stock 10, aucun refill pendant la tempête).
    const openResults = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        rpcOpenRaw(user, ['shonen', 'shojo'][i % 2]!, freshKey()),
      ),
    );
    await burnLoop;

    // Toutes les ouvertures ont réussi (stock 10 ≥ 10 ouvertures).
    for (const r of openResults) expect(r.error).toBeNull();
    const opened = openResults.flatMap((r) => (r.data as unknown as OpenResult).cards);

    // Aucune erreur inattendue pendant les burns.
    expect(burnErrors).toBe(0);

    // Invariants économiques.
    const final = await profile(user);
    expect(final.chakra).toBeGreaterThanOrEqual(chakraBefore);
    expect(final.booster_count).toBeGreaterThanOrEqual(0);
    expect(final.cards_obtained_count).toBe(opened.length);

    // 0 print dupliqué (toutes cartes confondues, même pendant le burn).
    const { data: allCards } = await admin
      .from('user_cards')
      .select('character_id, print_number')
      .eq('user_id', user);
    const seen = new Set<string>();
    for (const c of allCards ?? []) {
      const k = `${c.character_id}#${c.print_number}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    // Les cartes restantes = ouvertes - brûlées.
    expect(seen.size).toBe(opened.length - burnedIds.size);

    // drops_log complet : une ligne par carte jamais annulée (audit trail).
    const { count: drops } = await admin
      .from('drops_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user);
    expect(drops).toBe(opened.length);
  });

  it('MÊME idempotency_key ×5 en parallèle → exactement 1 débit', async () => {
    const user = userIds[1]!;
    await refillStock(admin, user);
    const before = await profile(user);

    const key = freshKey();
    const storm = await Promise.all(
      Array.from({ length: 5 }, () => rpcOpenRaw(user, 'shonen', key)),
    );

    const ok = storm.filter((r) => r.error === null);
    const inProgress = storm.filter((r) => /IDEMPOTENCY_IN_PROGRESS/.test(pgError(r.error)));
    // Soit le résultat stocké, soit une erreur propre d'appel en cours. Jamais
    // un 2e débit, jamais une erreur inconnue.
    expect(ok.length + inProgress.length).toBe(5);
    for (const r of ok) {
      expect(r.data).toEqual(ok[0]!.data);
    }

    const after = await profile(user);
    expect(before.booster_count - after.booster_count).toBe(1);
    expect(after.cards_obtained_count).toBe(5);
  });

  it('pool de 1 perso : 40 ouvertures parallèles → 40 prints distincts', async () => {
    const user = userIds[2]!;
    // Pool unique : thème dédié + unique perso rare dedans (aucun concurrent).
    await admin
      .from('themes')
      .upsert({ slug: 'qa-solo', name_fr: 'QA Solo', name_en: 'QA Solo', sort_order: 99 });
    const { data: solo } = await admin
      .from('characters')
      .insert({
        anilist_id: ANILIST_BASE + 999,
        name_romaji: 'QA Solo Concurrency',
        anime_title: 'QA Solo',
        favourites: 1,
        base_rarity: 'rare',
        themes: ['qa-solo'],
        image_url: 'https://placehold.co/300x420/111827/94a3b8?text=Solo',
        image_url_fallback: null,
      })
      .select('id')
      .single();
    // Roll déterministe : toujours du rare → toujours le perso solo.
    const RARE_ONLY = { rare: 100 };

    // 40 ouvertures en 4 vagues de 10 (stock cap 10 entre les vagues).
    // Le pity SPEC (L forcé tous les 25 opens) exigerait un perso legendary
    // dans le pool : qa-solo n'en a pas → EMPTY_POOL légitime + rollback du
    // reset pity = blocage permanent à 24. On remet les compteurs pity à 0
    // à chaque vague (fixture, même principe que l'ancrage de recharge) :
    // le test cible l'atomicité des prints, pas le pity. Cf. QA_REPORT.
    const prints: number[] = [];
    for (let wave = 0; wave < 4; wave++) {
      await refillStock(admin, user);
      await admin
        .from('profiles')
        .update({ pity_legendary: 0, pity_mythic: 0 })
        .eq('id', user);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => rpcOpenRaw(user, 'qa-solo', freshKey(), RARE_ONLY)),
      );
      for (const r of results) {
        expect(r.error).toBeNull();
        for (const c of (r.data as unknown as OpenResult).cards) {
          expect(c.character_id).toBe(solo!.id);
          prints.push(c.print_number);
        }
      }
    }

    expect(prints).toHaveLength(200);
    expect(new Set(prints).size).toBe(200); // 0 doublon même sur 1 perso × 200 tirages
    const { count } = await admin
      .from('user_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user)
      .eq('character_id', solo!.id);
    expect(count).toBe(200);
    // Le thème dédié et le perso sont purgés par cleanup() (afterAll).
  });

  it('recharge concurrente : le débit conditionnel ne passe jamais sous 0', async () => {
    const user = userIds[3]!;
    await refillStock(admin, user);
    // 15 ouvertures parallèles pour 10 boosters : 5 doivent échouer NO_BOOSTER,
    // jamais un booster_count négatif.
    const results = await Promise.all(
      Array.from({ length: 15 }, () => rpcOpenRaw(user, 'isekai', freshKey())),
    );
    const okCount = results.filter((r) => r.error === null).length;
    const noBooster = results.filter((r) => /NO_BOOSTER/.test(pgError(r.error))).length;
    expect(okCount).toBe(10);
    expect(noBooster).toBe(5);
    const final = await profile(user);
    expect(final.booster_count).toBe(0);
  });
});
