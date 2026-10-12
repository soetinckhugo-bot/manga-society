/**
 * ============================================================================
 * tests/economy.business.test.ts — TESTS MÉTIER Agent E (PROMPT E §2)
 *
 * Couvre ce que le smoke-engine (Agent A) ne couvre PAS :
 *   * streak J1→J7 (transitions hier/aujourd'hui/trou, récompense J7) ;
 *   * conformité de la table de streak À lib/config.ts (écart connu = it.fails) ;
 *   * cap wishlist 10 slots ('WISHLIST_FULL' — écart connu = it.fails) ;
 *   * points premium +1 exact par tranche de 100 (frontière 99→104, 195→200) ;
 *   * doré tous les 10 TYPES CONFONDUS (le 10e peut être un daily) ;
 *   * reset de compteur pity visible dans la réponse de l'ouverture déclenchée ;
 *   * daily pack : les cartes Épique+ obtenues NE progressent pas la quête
 *     'obtain_epic_plus' (écart connu = it.fails) ;
 *   * claim_quests : crédit exact, re-claim idempotent le même jour ;
 *   * buy_cosmetic : rachat d'un cosmétique déjà possédé = double débit silencieux
 *     (écart connu = it.fails).
 *
 * Cible Supabase LOCAL (CI) ; SMOKE_ENGINE_ALLOW_REMOTE=1 pour audit cloud.
 * ============================================================================
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GAME_CONFIG } from '@/lib/config';

import {
  ANILIST_BASE,
  cleanup,
  createUsers,
  freshKey,
  fx,
  IS_CONFIGURED,
  makeAdmin,
  pgError,
  refillStock,
  RUN_ID,
  seedFixtureCharacters,
  type Admin,
} from './helpers';

const NO_LM_WEIGHTS = { common: 100 };

interface GrantedCard {
  rarity: string;
  print_number: number;
  character_id: string;
}

interface OpenResult {
  cards: GrantedCard[];
  is_golden: boolean;
  pity_legendary: number;
  pity_mythic: number;
  golden_counter: number;
  premium_points: number;
  chakra: number;
  cards_obtained_count: number;
  booster_count?: number;
}

const THEME = 'shonen';

let admin: Admin;
let userIds: string[] = [];
let charIds: string[] = [];

async function rpcOpen(user: string, weights?: Record<string, number>): Promise<OpenResult> {
  const { data, error } = await admin.rpc('open_booster', {
    p_user: user,
    p_theme_slug: THEME,
    p_idempotency_key: freshKey(),
    ...(weights ? { p_weights: weights } : {}),
  });
  expect(error).toBeNull();
  return data as unknown as OpenResult;
}

/** Ouvre n boosters avec rechargement du stock (logique réelle, pas contournée). */
async function openMany(user: string, count: number, weights?: Record<string, number>) {
  const results: OpenResult[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 9 === 0) await refillStock(admin, user);
    results.push(await rpcOpen(user, weights));
  }
  return results;
}

describe.skipIf(!IS_CONFIGURED)('business — streak / wishlist / points / quêtes / shop', () => {
  beforeAll(async () => {
    admin = makeAdmin();
    await seedFixtureCharacters(admin);
    userIds = await createUsers(admin, 8);
    const { data: chars } = await admin
      .from('characters')
      .select('id')
      .gte('anilist_id', ANILIST_BASE)
      .order('anilist_id');
    charIds = (chars ?? []).map((c) => c.id);
    expect(charIds.length).toBeGreaterThanOrEqual(11);
  });

  afterAll(async () => {
    await cleanup(admin, userIds);
  });

  // --- Streak ----------------------------------------------------------------

  it('streak : hier → +1 + chakra croissant ; aujourd\'hui → no-op strict', async () => {
    const user = userIds[0]!;
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Fixture : ancre la date du dernier login à hier (hors économie).
    await fx(admin.from('profiles').update({ last_login_date: yesterday, login_streak: 0 }).eq('id', user));
    const { data: s1 } = await admin.rpc('update_login_streak', { p_user: user });
    const r1 = s1 as unknown as { login_streak: number; reward: string; chakra_gained: number };
    expect(r1.login_streak).toBe(1);
    expect(r1.reward).toBe('chakra');
    expect(r1.chakra_gained).toBeGreaterThan(0);

    // Même jour → no-op : pas de double récompense.
    const { data: s2 } = await admin.rpc('update_login_streak', { p_user: user });
    const r2 = s2 as unknown as { login_streak: number; reward: string; chakra_gained: number };
    expect(r2.login_streak).toBe(1);
    expect(r2.reward).toBe('none');
    expect(r2.chakra_gained).toBe(0);

    const { data: p } = await admin.from('profiles').select('chakra').eq('id', user).single();
    expect(p?.chakra).toBe(r1.chakra_gained);
  });

  it('streak : trou de 2 jours → reset à 1', async () => {
    const user = userIds[1]!;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await fx(admin.from('profiles').update({ last_login_date: threeDaysAgo, login_streak: 9 }).eq('id', user));
    const { data } = await admin.rpc('update_login_streak', { p_user: user });
    expect((data as unknown as { login_streak: number }).login_streak).toBe(1);
  });

  it('streak : J7 → cosmétique streak-7 (pas de chakra)', async () => {
    const user = userIds[2]!;
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    await fx(admin.from('profiles').update({ last_login_date: yesterday, login_streak: 6 }).eq('id', user));
    const { data } = await admin.rpc('update_login_streak', { p_user: user });
    const r = data as unknown as { login_streak: number; reward: string; cosmetic_slug?: string; chakra_gained: number };
    expect(r.login_streak).toBe(7);
    expect(r.reward).toBe('cosmetic');
    expect(r.cosmetic_slug).toBe('streak-7');
    expect(r.chakra_gained).toBe(0);
    const { data: owned } = await admin
      .from('user_cosmetics')
      .select('cosmetic_id')
      .eq('user_id', user);
    expect((owned ?? []).length).toBe(1);
  });

  // P1 — QA_REPORT #E-03 : table SQL divergente de lib/config.ts.
  it.fails('streak : chakra J1→J6 == config.streak.chakraByDay [20,25,30,40,50,65]', async () => {
    const user = userIds[3]!;
    const gains: number[] = [];
    for (let day = 0; day < 6; day++) {
      const anchor = new Date(Date.now() - (day + 1) * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      await fx(
        admin
          .from('profiles')
          .update({ last_login_date: anchor, login_streak: day })
          .eq('id', user),
      );
      const { data } = await admin.rpc('update_login_streak', { p_user: user });
      gains.push((data as unknown as { chakra_gained: number }).chakra_gained);
    }
    // ÉCHEC ATTENDU tant que 0001 utilise least(streak,10)*5 (5,10,15,20,25,30)
    // au lieu de la table de lib/config.ts (20,25,30,40,50,65). Devient rouge
    // ("fails test passed") dès que l'alignement est fait → retirer le .fails.
    expect(gains).toEqual([...GAME_CONFIG.streak.chakraByDay.slice(0, 6)]);
  });

  // --- Wishlist ---------------------------------------------------------------

  // P1 — QA_REPORT #E-02 : toggle_wishlist ne lève jamais WISHLIST_FULL.
  it.fails('wishlist : le 11e ajout distinct est refusé (WISHLIST_FULL), cap 10', async () => {
    const user = userIds[4]!;
    let lastError = '';
    for (let i = 0; i < 11; i++) {
      const { error } = await admin.rpc('toggle_wishlist', {
        p_user: user,
        p_character_id: charIds[i]!,
      });
      if (error) {
        lastError = pgError(error);
        break;
      }
    }
    expect(lastError).toContain('WISHLIST_FULL');
    const { data: rows } = await admin.from('wishlists').select('character_id').eq('user_id', user);
    expect((rows ?? []).length).toBe(10);
  });

  it('wishlist : toggle on/off couple strictement characters.wishlist_count (plancher 0)', async () => {
    const user = userIds[5]!;
    const char = charIds[10]!;
    const { data: before } = await admin
      .from('characters')
      .select('wishlist_count')
      .eq('id', char)
      .single();
    await admin.rpc('toggle_wishlist', { p_user: user, p_character_id: char });
    const { data: on } = await admin.from('characters').select('wishlist_count').eq('id', char).single();
    expect(on?.wishlist_count).toBe((before?.wishlist_count ?? 0) + 1);
    await admin.rpc('toggle_wishlist', { p_user: user, p_character_id: char });
    const { data: off } = await admin.from('characters').select('wishlist_count').eq('id', char).single();
    expect(off?.wishlist_count).toBe(before?.wishlist_count ?? 0);
  });

  // --- Points premium ----------------------------------------------------------

  it('points premium : +1 exact à la tranche 100 (frontières 99→104 et 195→200)', async () => {
    const user = userIds[6]!;
    await refillStock(admin, user);
    // Frontière 1 : 99 cartes + daily (5 cartes) → 104 → exactement +1 point.
    await fx(admin.from('profiles').update({ cards_obtained_count: 99, premium_points: 0 }).eq('id', user));
    const d1 = await admin.rpc('claim_daily_pack', { p_user: user, p_idempotency_key: freshKey() });
    expect(d1.error).toBeNull();
    const p = await admin.from('profiles').select('premium_points, cards_obtained_count').eq('id', user).single();
    expect(p.data?.cards_obtained_count).toBe(104);
    expect(p.data?.premium_points).toBe(1);

    // Frontière 2 : 195 + 5 cartes (booster) → 200 → +1 point supplémentaire.
    await fx(admin.from('profiles').update({ cards_obtained_count: 195 }).eq('id', user));
    const o1 = await rpcOpen(user);
    expect(o1.cards_obtained_count).toBe(200);
    expect(o1.premium_points).toBe(2);

    // Sous la tranche : 200 → 205 → +0 point.
    const o2 = await rpcOpen(user);
    expect(o2.cards_obtained_count).toBe(205);
    expect(o2.premium_points).toBe(2);
  });

  // --- Doré tous types confondus + reset pity visible ---------------------------

  it('doré : le 10e peut être un DAILY PACK (tous types confondus, SPEC §1)', async () => {
    const user = userIds[7]!;
    await refillStock(admin, user);
    const nine = await openMany(user, 9, NO_LM_WEIGHTS);
    expect(nine.every((r) => !r.is_golden)).toBe(true);
    expect(nine[8]!.golden_counter).toBe(9);

    const daily = await admin.rpc('claim_daily_pack', {
      p_user: user,
      p_idempotency_key: freshKey(),
    });
    expect(daily.error).toBeNull();
    const d = daily.data as unknown as OpenResult;
    expect(d.is_golden).toBe(true);
    expect(d.golden_counter).toBe(0);

    // Le suivant n'est PAS doré.
    const next = await rpcOpen(user, NO_LM_WEIGHTS);
    expect(next.is_golden).toBe(false);
    expect(next.golden_counter).toBe(1);
  });

  it('pity L : la 25e ouverture déclenche la garantie ET reset le compteur (réponse)', async () => {
    const user = userIds[7]!;
    await refillStock(admin, user);
    // golden_counter de l'utilisateur n'est pas à un multiple de 10 problématique :
    // on consompe jusqu'au prochain palier doré pour isoler le pity.
    const results = await openMany(user, 25, NO_LM_WEIGHTS);
    const triggered = results.filter((r) => r.pity_legendary === 0);
    expect(triggered.length).toBeGreaterThanOrEqual(1);
    // La garantie a forcé un L sur le slot 1.
    const forced = triggered[0]!;
    expect(['legendary', 'mythic']).toContain(forced.cards[0]!.rarity);
    // Après reset, le compteur repart de 1 à l'ouverture suivante.
    const after = results[results.indexOf(forced) + 1];
    if (after) expect(after.pity_legendary).toBe(1);
  });

  // --- Quêtes -------------------------------------------------------------------

  // P2 — QA_REPORT #E-05 : les 5 cartes Épique+ du daily ne progressent pas la
  // quête 'obtain_epic_plus' (claim_daily_pack ne progresse que son propre type).
  it.fails('daily pack : les cartes Épique+ obtenues progressent la quête obtain_epic_plus', async () => {
    const user = userIds[0]!;
    const { data: epicQuest } = await admin
      .from('quests')
      .select('id')
      .eq('type', 'obtain_epic_plus')
      .single();
    // Fixture : impose la quête du jour (remplace les 3 aléatoires).
    const today = new Date().toISOString().slice(0, 10);
    await admin.from('user_quests').delete().eq('user_id', user);
    await admin.from('user_quests').insert({ user_id: user, quest_id: epicQuest!.id, day: today });
    await admin.rpc('claim_daily_pack', { p_user: user, p_idempotency_key: freshKey() });
    const { data: uq } = await admin
      .from('user_quests')
      .select('progress, completed')
      .eq('user_id', user)
      .eq('quest_id', epicQuest!.id)
      .single();
    // 5 cartes E+ obtenues : la progression devrait être ≥ 1 (goal = 1).
    expect(uq?.completed).toBe(true);
  });

  it('claim_quests : crédit exact puis re-claim idempotent (0 chakra)', async () => {
    const user = userIds[1]!;
    const { data: quest } = await admin
      .from('quests')
      .select('id, chakra_reward')
      .eq('key', 'daily-claim-pack')
      .single();
    const today = new Date().toISOString().slice(0, 10);
    await admin.from('user_quests').delete().eq('user_id', user);
    await admin.from('user_quests').insert({
      user_id: user,
      quest_id: quest!.id,
      day: today,
      progress: 1,
      completed: true,
    });
    const { data: before } = await admin.from('profiles').select('chakra').eq('id', user).single();

    const c1 = await admin.rpc('claim_quests', { p_user: user, p_quest_ids: [quest!.id] });
    expect(c1.error).toBeNull();
    const r1 = c1.data as unknown as { chakra_gained: number; new_balance: number };
    expect(r1.chakra_gained).toBe(quest!.chakra_reward);
    expect(r1.new_balance).toBe((before?.chakra ?? 0) + quest!.chakra_reward);

    // Re-claim le même jour : no-op.
    const c2 = await admin.rpc('claim_quests', { p_user: user, p_quest_ids: [quest!.id] });
    const r2 = c2.data as unknown as { chakra_gained: number; new_balance: number };
    expect(r2.chakra_gained).toBe(0);
    expect(r2.new_balance).toBe(r1.new_balance);
  });

  // --- Shop ----------------------------------------------------------------------

  // P1 — QA_REPORT #E-04 : racheter un cosmétique déjà possédé débite le prix en
  // entier une seconde fois (INSERT ... ON CONFLICT DO NOTHING silencieux).
  it.fails('shop : racheter un cosmétique possédé ne débite pas (ou est refusé)', async () => {
    const user = userIds[2]!;
    const { data: cosmetic } = await admin
      .from('cosmetics')
      .select('id, chakra_price')
      .eq('slug', 'frame-bronze')
      .single();
    await fx(admin.from('profiles').update({ chakra: 10_000 }).eq('id', user));
    const buy1 = await admin.rpc('buy_cosmetic', {
      p_user: user,
      p_cosmetic_id: cosmetic!.id,
      p_idempotency_key: freshKey(),
    });
    expect(buy1.error).toBeNull();
    const buy2 = await admin.rpc('buy_cosmetic', {
      p_user: user,
      p_cosmetic_id: cosmetic!.id,
      p_idempotency_key: freshKey(),
    });
    // Comportement attendu : refus (409) ou achat neutre — PAS un second débit.
    const r2 = buy2.data as unknown as { new_balance: number } | null;
    const r1 = buy1.data as unknown as { new_balance: number };
    expect(buy2.error).not.toBeNull();
    void r2;
    void r1;
  });

  it('reroll_cosmetic : refuse sur une carte sans cosmétique (NO_COSMETIC_TO_REROLL)', async () => {
    const user = userIds[3]!;
    await refillStock(admin, user);
    const opened = await rpcOpen(user);
    const cardId = opened.cards[0]!.character_id;
    const { data: card } = await admin
      .from('user_cards')
      .select('id')
      .eq('user_id', user)
      .eq('character_id', cardId)
      .single();
    const { error } = await admin.rpc('reroll_cosmetic', {
      p_user: user,
      p_card_id: card!.id,
      p_cosmetic_type: 'frame',
      p_idempotency_key: freshKey(),
    });
    expect(pgError(error)).toContain('NO_COSMETIC_TO_REROLL');
  });
});

// Marqueur de run pour traçabilité des audits cloud.
void RUN_ID;
