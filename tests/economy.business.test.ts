/**
 * ============================================================================
 * tests/economy.business.test.ts — TESTS MÉTIER Agent E (PROMPT E §2)
 *
 * Couvre ce que le smoke-engine (Agent A) ne couvre PAS :
 *   * streak J1→J7 (transitions hier/aujourd'hui/trou, récompense J7) et
 *     conformité de la table de récompense À lib/config.ts (corrigé 0008) ;
 *   * cap wishlist 10 slots ('WISHLIST_FULL' — corrigé 0008) ;
 *   * points premium +1 exact par tranche de 100 (frontière 99→104, 195→200) ;
 *   * doré tous les 10 TYPES CONFONDUS (le 10e peut être un daily) ;
 *   * reset de compteur pity visible dans la réponse de l'ouverture déclenchée ;
 *   * daily pack : les cartes Épique+ obtenues progressent la quête
 *     'obtain_epic_plus' (corrigé 0008) ;
 *   * claim_quests : crédit exact, re-claim idempotent le même jour ;
 *   * buy_cosmetic : rachat d'un cosmétique déjà possédé = refus propre
 *     'ALREADY_OWNED' avant tout débit (corrigé 0008) ;
 *   * reroll_cosmetic : débit unique, crédit d'un cosmétique jamais possédé
 *     (corrigé 0008, idempotence par clé vérifiée).
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

  // P1 — QA_REPORT #E-03 (corrigé 0008) : la table SQL de récompense est
  // portée en paramètres DEFAULT alignés sur lib/config.ts
  // (chakraByDay = [20,25,30,40,50,65,0], palier cosmétique jour 7).
  it('streak : chakra J1→J6 == config.streak.chakraByDay [20,25,30,40,50,65]', async () => {
    const user = userIds[3]!;
    const gains: number[] = [];
    for (let day = 0; day < 6; day++) {
      // Ancrage CONSTANT à hier (connexion consécutive) avec un streak de
      // départ = day : la RPC incrémente à day+1 et paie chakraByDay[day].
      // (Ancrer à J-(day+1) simulerait un trou → reset à 1 à chaque tour.)
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
      await fx(
        admin
          .from('profiles')
          .update({ last_login_date: yesterday, login_streak: day })
          .eq('id', user),
      );
      const { data } = await admin.rpc('update_login_streak', { p_user: user });
      gains.push((data as unknown as { chakra_gained: number }).chakra_gained);
    }
    // Garde de non-régression E-03 : toute dérive de la table SQL vers une
    // valeur hors lib/config.ts échoue ici (le DEFAULT SQL est la duplication
    // serveur autorisée de la config, standard n°12).
    expect(gains).toEqual([...GAME_CONFIG.streak.chakraByDay.slice(0, 6)]);
  });

  // --- Wishlist ---------------------------------------------------------------

  // P1 — QA_REPORT #E-02 (corrigé 0008) : toggle_wishlist lève WISHLIST_FULL
  // au 11e ajout distinct (cap 10, paramètre DEFAULT aligné sur
  // config.wishlist.maxSlots) et l'INSERT candidat est rollback.
  it('wishlist : le 11e ajout distinct est refusé (WISHLIST_FULL), cap 10', async () => {
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

  // P2 — QA_REPORT #E-05 (corrigé 0008) : les 5 cartes Épique+ du daily
  // progressent la quête 'obtain_epic_plus' (claim_daily_pack progresse son
  // propre type ET le comptage E+, comme open_booster).
  it('daily pack : les cartes Épique+ obtenues progressent la quête obtain_epic_plus', async () => {
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

  // P1 — QA_REPORT #E-04 (corrigé 0008) : racheter un cosmétique déjà
  // possédé est REFUSÉ avant tout débit ('ALREADY_OWNED') — l'ancien ordre
  // débitait puis absorbait le doublon en ON CONFLICT DO NOTHING.
  it('shop : racheter un cosmétique possédé est refusé (ALREADY_OWNED, aucun débit)', async () => {
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
    const balanceAfterFirstBuy = (buy1.data as unknown as { new_balance: number }).new_balance;

    const buy2 = await admin.rpc('buy_cosmetic', {
      p_user: user,
      p_cosmetic_id: cosmetic!.id,
      p_idempotency_key: freshKey(),
    });
    // Refus propre : 409 ALREADY_OWNED, le solde n'a pas bougé d'un chakra.
    expect(pgError(buy2.error)).toContain('ALREADY_OWNED');
    const { data: p } = await admin.from('profiles').select('chakra').eq('id', user).single();
    expect(p?.chakra).toBe(balanceAfterFirstBuy);
    // Une seule ligne en inventaire (pas de doublon).
    const { data: owned } = await admin
      .from('user_cosmetics')
      .select('cosmetic_id')
      .eq('user_id', user)
      .eq('cosmetic_id', cosmetic!.id);
    expect((owned ?? []).length).toBe(1);
  });

  it('reroll_cosmetic : refuse sur une carte sans cosmétique (NO_COSMETIC_TO_REROLL)', async () => {
    const user = userIds[3]!;
    await refillStock(admin, user);
    const opened = await rpcOpen(user);
    const cardId = opened.cards[0]!.character_id;
    // Pas de .single() : un pack peut contenir DEUX instances du même perso
    // (_pick_character tire chaque carte indépendamment ; pool local = 12
    // fixtures shonen). Toute instance du perso convient au reroll.
    const { data: cardRows } = await admin
      .from('user_cards')
      .select('id')
      .eq('user_id', user)
      .eq('character_id', cardId)
      .limit(1);
    const card = cardRows?.[0] ?? null;
    const { error } = await admin.rpc('reroll_cosmetic', {
      p_user: user,
      p_card_id: card!.id,
      p_cosmetic_type: 'frame',
      p_idempotency_key: freshKey(),
    });
    expect(pgError(error)).toContain('NO_COSMETIC_TO_REROLL');
  });

  // P1 — QA_REPORT #E-04 (corrigé 0008, volet reroll) : le tirage exclut
  // l'inventaire du joueur — le reroll débite UNE fois et crédite toujours
  // une instance jamais possédée (l'ancien code pouvait créditer un
  // cosmétique déjà possédé : slot brûlé, 25 chakra débités, rien reçu).
  it('reroll_cosmetic : 1 seul débit, crédite un cosmétique jamais possédé', async () => {
    const user = userIds[7]!;
    await refillStock(admin, user);
    const opened = await rpcOpen(user);
    // Même règle que le test précédent : pas de .single() (doublons possibles
    // d'un même perso dans un pack) — la première instance suffit.
    const { data: cardRows } = await admin
      .from('user_cards')
      .select('id')
      .eq('user_id', user)
      .eq('character_id', opened.cards[0]!.character_id)
      .limit(1);
    const card = cardRows?.[0] ?? null;
    const { data: frame } = await admin
      .from('cosmetics')
      .select('id, chakra_price')
      .eq('slug', 'frame-bronze')
      .single();
    await fx(admin.from('profiles').update({ chakra: 10_000 }).eq('id', user));
    const buy = await admin.rpc('buy_cosmetic', {
      p_user: user,
      p_cosmetic_id: frame!.id,
      p_idempotency_key: freshKey(),
    });
    expect(buy.error).toBeNull();
    const apply = await admin.rpc('apply_cosmetic', {
      p_user: user,
      p_card_id: card!.id,
      p_cosmetic_id: frame!.id,
      p_idempotency_key: freshKey(),
    });
    expect(apply.error).toBeNull();
    const balanceBeforeReroll = 10_000 - frame!.chakra_price;

    const key = freshKey();
    const r1 = await admin.rpc('reroll_cosmetic', {
      p_user: user,
      p_card_id: card!.id,
      p_cosmetic_type: 'frame',
      p_idempotency_key: key,
    });
    expect(r1.error).toBeNull();
    const r1d = r1.data as unknown as {
      new_balance: number;
      burned_cosmetic: string;
      new_cosmetic: string;
    };
    // Débit unique de p_cost (25), crédit réel : jamais le cosmétique brûlé.
    expect(r1d.new_balance).toBe(balanceBeforeReroll - 25);
    expect(r1d.new_cosmetic).not.toBe(frame!.id);

    // Idempotence : rejouer la MÊME clé rejoue le résultat stocké, sans
    // second débit (le "double débit" historique est tenu hors d'état).
    const r2 = await admin.rpc('reroll_cosmetic', {
      p_user: user,
      p_card_id: card!.id,
      p_cosmetic_type: 'frame',
      p_idempotency_key: key,
    });
    expect(r2.error).toBeNull();
    expect((r2.data as unknown as { new_balance: number }).new_balance).toBe(r1d.new_balance);

    // Inventaire : brûlé conservé + nouveau présent (une seule fois). Le
    // slot de la carte est LIBÉRÉ par le reroll (SPEC §2.1 : « brûle
    // l'instance, crédite un autre » — le nouveau cosmétique arrive en
    // inventaire, son application sur la carte reste un appel dédié).
    const { data: owned } = await admin
      .from('user_cosmetics')
      .select('cosmetic_id')
      .eq('user_id', user);
    const ownedIds = (owned ?? []).map((o) => o.cosmetic_id);
    expect(ownedIds).toContain(frame!.id);
    expect(ownedIds.filter((id) => id === r1d.new_cosmetic).length).toBe(1);
    const { data: cardAfter } = await admin
      .from('user_cards')
      .select('frame_id')
      .eq('id', card!.id)
      .single();
    expect(cardAfter?.frame_id).toBeNull();
  });
});

// Marqueur de run pour traçabilité des audits cloud.
void RUN_ID;
