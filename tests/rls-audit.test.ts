/**
 * ============================================================================
 * tests/rls-audit.test.ts — RLS AUDIT Agent E (PROMPT E §4 + P0 authz RPC)
 *
 * Deux users A et B authentifiés (vrais JWT anon key + session). Pour CHAQUE
 * table du schéma :
 *   * A ne lit RIEN de B (tables privées) / lit bien les tables publiques ;
 *   * A ne peut PAS modifier les données de B (relecture via le JWT de B) ;
 *   * écritures directes interdites (deny-by-default : pas de GRANT INSERT) ;
 *   * drops_log : insert-only côté RPC, AUCUNE lecture ;
 *   * anon : lecture publique OK, profiles/cartes interdits.
 *
 * Trous historiques (corrigés en migration 0008 — les marqueurs `it.fails`
 * ont été basculés en assertions normales, leur rôle de détecteur étant
 * rempli) :
 *   #E-01 : aucune RPC ne vérifiait p_user = auth.uid() → A invoquait
 *           l'économie au nom de B. Corrigé : garde `_assert_self` en tête
 *           de TOUTES les RPC p_user ('FORBIDDEN', aucune écriture) ;
 *   #E-07 : get_public_profile plantait (`uc.rarity` n'existe pas sur
 *           user_cards — 0007). Corrigé : jointure characters.base_rarity.
 * Trou restant documenté en `it.fails` : aucun dans ce fichier.
 *
 * Cible Supabase LOCAL (CI) ; SMOKE_ENGINE_ALLOW_REMOTE=1 pour audit cloud.
 * Les relectures passent par les JWT de A/B (pas de grant service role requis).
 * ============================================================================
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/types/database';

import {
  ANON_KEY,
  cleanup,
  createUsers,
  freshKey,
  IS_CONFIGURED,
  makeAdmin,
  makeUserClient,
  pgError,
  RUN_ID,
  seedFixtureCharacters,
  SUPABASE_URL,
  userEmail,
  type Admin,
} from './helpers';

let admin: Admin;
let a: SupabaseClient<Database>;
let b: SupabaseClient<Database>;
let anon: SupabaseClient<Database>;
let userA = '';
let userB = '';
let charB = '';

describe.skipIf(!IS_CONFIGURED)('RLS audit — A ne touche rien de B', () => {
  beforeAll(async () => {
    admin = makeAdmin();
    await seedFixtureCharacters(admin);
    const [idA, idB] = await createUsers(admin, 2);
    userA = idA!;
    userB = idB!;
    a = await makeUserClient(userEmail(0), 'qa-password-1234');
    b = await makeUserClient(userEmail(1), 'qa-password-1234');
    // Client strictement anon (sans session) pour les lectures publiques.
    anon = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

    // Cibles publiques de lecture (characters est en lecture publique).
    const { data: chars } = await anon.from('characters').select('id').order('anilist_id').limit(3);
    charB = chars![0]!.id;

    // B possède une wishlist + des cartes (via RPC uniquement — jamais d'écriture
    // directe). Chaque appel est vérifié : un fixture silencieux fausse l'audit.
    const w = await admin.rpc('toggle_wishlist', { p_user: userB, p_character_id: charB });
    expect(w.error).toBeNull();
    const o = await admin.rpc('open_booster', {
      p_user: userB,
      p_theme_slug: 'shonen',
      p_idempotency_key: freshKey(),
    });
    expect(o.error).toBeNull();
  });

  afterAll(async () => {
    await cleanup(admin, [userA, userB]);
  });

  // --- Isolation lecture -------------------------------------------------------

  it('profiles : A ne lit pas la ligne de B', async () => {
    const { data } = await a.from('profiles').select('*').eq('id', userB);
    expect(data).toEqual([]);
  });

  it('user_cards : A ne voit aucune carte de B', async () => {
    const { data } = await a.from('user_cards').select('id').eq('user_id', userB);
    expect(data).toEqual([]);
    // (B possède bien 5 cartes : vérification par le JWT de B lui-même.)
    const { data: own } = await b.from('user_cards').select('id');
    expect((own ?? []).length).toBe(5);
  });

  it('wishlists / user_quests / user_cosmetics / booster_openings : A ne lit rien de B', async () => {
    for (const table of ['wishlists', 'user_quests', 'user_cosmetics', 'booster_openings'] as const) {
      const { data } = await a.from(table).select('*').eq('user_id', userB);
      expect(data, table).toEqual([]);
    }
    const { data: ownWishlist } = await b.from('wishlists').select('character_id');
    expect((ownWishlist ?? []).length).toBe(1);
  });

  it('idempotency_keys : A ne lit pas les clés de B (et ne peut pas en insérer)', async () => {
    const { data } = await a.from('idempotency_keys').select('key').eq('user_id', userB);
    expect(data).toEqual([]);
    const { error } = await a
      .from('idempotency_keys')
      .insert({ key: freshKey(), user_id: userA, endpoint: 'rls-audit' });
    expect(error).not.toBeNull();
  });

  it('drops_log : AUCUNE lecture possible (deny-by-default total)', async () => {
    const { data, error } = await a.from('drops_log').select('*').eq('user_id', userB);
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
    const { error: insertErr } = await a.from('drops_log').insert({
      user_id: userA,
      character_id: charB,
      rarity: 'common',
      print_number: 1,
      source: 'booster',
    });
    expect(insertErr).not.toBeNull();
  });

  // --- Isolation écriture (relecture par le JWT de B) ------------------------------

  it('profiles : A ne peut pas modifier le chakra/les compteurs de B', async () => {
    const before = (await b.from('profiles').select('chakra').eq('id', userB).single()).data;
    expect(before).not.toBeNull();
    const { error } = await a.from('profiles').update({ chakra: 99_999 }).eq('id', userB);
    const after = (await b.from('profiles').select('chakra').eq('id', userB).single()).data;
    expect(after?.chakra).toBe(before?.chakra);
    void error; // informatif : erreur GRANT/RLS ou 0 ligne (PostgREST renvoie 200+[])
  });

  it('user_cards : A ne peut pas réécrire les cartes de B', async () => {
    const { data: card } = await b
      .from('user_cards')
      .select('id, first_owner')
      .eq('user_id', userB)
      .limit(1)
      .single();
    expect(card).not.toBeNull();
    const { error } = await a.from('user_cards').update({ first_owner: false }).eq('id', card!.id);
    const after = (await b.from('user_cards').select('first_owner').eq('id', card!.id).single()).data;
    expect(after?.first_owner).toBe(card!.first_owner);
    void error;
  });

  it('wishlists : A ne peut pas modifier la wishlist de B', async () => {
    const before = (await b.from('wishlists').select('character_id').eq('user_id', userB).single()).data;
    const { data: others } = await anon.from('characters').select('id').order('anilist_id').limit(3);
    const { error } = await a
      .from('wishlists')
      .update({ character_id: others![1]!.id })
      .eq('user_id', userB);
    const after = (await b.from('wishlists').select('character_id').eq('user_id', userB).single()).data;
    expect(after?.character_id).toBe(before?.character_id);
    void error;
  });

  it('user_quests : A ne modifie pas la progression de B', async () => {
    const before = (await b.from('user_quests').select('progress').eq('user_id', userB).limit(1).single()).data;
    expect(before).not.toBeNull();
    const { error } = await a.from('user_quests').update({ progress: 999 }).eq('user_id', userB);
    const after = (await b.from('user_quests').select('progress').eq('user_id', userB).limit(1).single()).data;
    expect(after?.progress).toBe(before?.progress);
    void error;
  });

  it('user_cosmetics : pas d\'INSERT direct possible pour A (GRANT select only)', async () => {
    const { data: cosmetic } = await anon.from('cosmetics').select('id').limit(1).single();
    expect(cosmetic).not.toBeNull();
    const { error } = await a.from('user_cosmetics').insert({ user_id: userA, cosmetic_id: cosmetic!.id });
    expect(error).not.toBeNull();
  });

  // --- Lectures publiques ----------------------------------------------------------

  it('tables publiques : anon lit themes/characters/cosmetics/quests', async () => {
    for (const table of ['themes', 'characters', 'cosmetics', 'quests'] as const) {
      const { count, error } = await anon
        .from(table)
        .select('*', { count: 'exact', head: true });
      expect(error).toBeNull();
      expect(count ?? 0, table).toBeGreaterThan(0);
    }
  });

  it('anon : pas de lecture de profiles ni de cartes (même les siens : pas de session)', async () => {
    const { data } = await anon.from('profiles').select('id');
    expect(data ?? []).toEqual([]);
    const { data: cards } = await anon.from('user_cards').select('id');
    expect(cards ?? []).toEqual([]);
  });

  // P1 — QA_REPORT #E-07 (corrigé 0008) : get_public_profile référençait
  // uc.rarity (absente de user_cards — la rareté vit sur
  // characters.base_rarity) → 42703 pour tout joueur possédant des cartes.
  it('profil public : get_public_profile fonctionne pour un joueur avec des cartes', async () => {
    const { data, error } = await anon.rpc('get_public_profile', {
      p_username: `qa_${RUN_ID}_1`,
    });
    expect(error).toBeNull();
    const p = data as unknown as { username: string; chakra?: unknown; premium_points?: unknown };
    expect(p.username).toBeTruthy();
    // Les colonnes économiques privées ne fuient pas dans le DTO public.
    expect(p).not.toHaveProperty('chakra');
    expect(p).not.toHaveProperty('premium_points');
  });

  // --- P0 authz (E-01, corrigé 0008) : p_user arbitraire ------------------------

  // QA_REPORT #E-01 : la garde `_assert_self` (migration 0008) refuse tout
  // appel JWT dont p_user <> auth.uid() ('FORBIDDEN'), en PREMIÈRE
  // instruction — avant la ligne d'idempotence et toute écriture. Les appels
  // service_role (auth.uid() NULL : scripts, smoke, sim) sont inchangés.
  // Scénario d'attaque d'E rejoué : A agit au nom de B → tout est bloqué,
  // aucune écriture ne survit.

  it('AUTHZ : open_booster(p_user=B) refusé pour A (stock de B intact)', async () => {
    const before = (await b.from('profiles').select('booster_count').eq('id', userB).single()).data;
    const { error } = await a.rpc('open_booster', {
      p_user: userB,
      p_theme_slug: 'shonen',
      p_idempotency_key: freshKey(),
    });
    expect(pgError(error)).toContain('FORBIDDEN');
    const after = (await b.from('profiles').select('booster_count').eq('id', userB).single()).data;
    expect(after?.booster_count).toBe(before?.booster_count);
  });

  it('AUTHZ : toggle_wishlist(p_user=B) refusé pour A (wishlist de B intacte)', async () => {
    const { data: others } = await anon.from('characters').select('id').order('anilist_id').limit(3);
    const before = (await b.from('wishlists').select('character_id')).data;
    const { error } = await a.rpc('toggle_wishlist', {
      p_user: userB,
      p_character_id: others![2]!.id,
    });
    expect(pgError(error)).toContain('FORBIDDEN');
    const after = (await b.from('wishlists').select('character_id')).data;
    expect(after).toEqual(before);
  });

  it('AUTHZ : set_username(p_user=B) refusé pour A (pseudo de B intact)', async () => {
    const { error } = await a.rpc('set_username', {
      p_user: userB,
      p_username: `hacked_${Date.now().toString(36)}`,
    });
    expect(pgError(error)).toContain('FORBIDDEN');
    const after = (await b.from('profiles').select('username').eq('id', userB).single()).data;
    expect(after?.username).toBe(`qa_${RUN_ID}_1`);
  });

  // Couverture exhaustive de la surface RPC : mutations, lectures privées et
  // vitrine. Chaque appel doit lever 'FORBIDDEN' et l'état économique de B
  // doit être strictement identique après la rafale.
  it('AUTHZ : toutes les RPC p_user refusent p_user=B pour A (aucune écriture)', async () => {
    const before = (
      await b
        .from('profiles')
        .select('booster_count, chakra, premium_points, login_streak, daily_pack_claimed, username')
        .eq('id', userB)
        .single()
    ).data;
    const { data: card } = await b
      .from('user_cards')
      .select('id')
      .eq('user_id', userB)
      .limit(1)
      .single();
    const { data: cosmetic } = await anon
      .from('cosmetics')
      .select('id')
      .eq('slug', 'frame-bronze')
      .single();
    expect(card).not.toBeNull();
    expect(cosmetic).not.toBeNull();

    const attempts = [
      a.rpc('claim_daily_pack', { p_user: userB, p_idempotency_key: freshKey() }),
      a.rpc('burn_card', { p_user: userB, p_card_id: card!.id, p_idempotency_key: freshKey() }),
      a.rpc('update_login_streak', { p_user: userB }),
      a.rpc('buy_cosmetic', { p_user: userB, p_cosmetic_id: cosmetic!.id, p_idempotency_key: freshKey() }),
      a.rpc('open_premium_booster', { p_user: userB, p_idempotency_key: freshKey() }),
      a.rpc('apply_cosmetic', { p_user: userB, p_card_id: card!.id, p_cosmetic_id: cosmetic!.id, p_idempotency_key: freshKey() }),
      a.rpc('reroll_cosmetic', { p_user: userB, p_card_id: card!.id, p_cosmetic_type: 'frame', p_idempotency_key: freshKey() }),
      a.rpc('claim_quests', { p_user: userB, p_quest_ids: [crypto.randomUUID()] }),
      a.rpc('get_booster_state', { p_user: userB }),
      a.rpc('get_collection_page', { p_user: userB }),
      a.rpc('get_album', { p_user: userB }),
      a.rpc('get_card_detail', { p_user: userB, p_card_id: card!.id }),
      a.rpc('get_daily_quests', { p_user: userB }),
      a.rpc('get_wishlist', { p_user: userB }),
      a.rpc('get_theme_pool_info', { p_user: userB, p_slug: 'shonen' }),
      a.rpc('set_showcase', { p_user: userB, p_card_ids: [card!.id] }),
    ];
    const results = await Promise.all(attempts);
    for (const r of results) {
      expect(pgError((r as { error: { message?: string } | null }).error)).toContain('FORBIDDEN');
    }

    const after = (
      await b
        .from('profiles')
        .select('booster_count, chakra, premium_points, login_streak, daily_pack_claimed, username')
        .eq('id', userB)
        .single()
    ).data;
    expect(after).toEqual(before);
    // Les lectures cross-user sont aussi bloquées : A n'a vu aucune carte de B
    // via la RPC (son propre état n'a pas non plus bougé).
    const { data: own } = await a.from('user_cards').select('id');
    expect((own ?? []).length).toBe(0);
  });
});
