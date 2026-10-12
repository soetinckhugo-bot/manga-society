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
 * Trous connus documentés en `it.fails` (passent tant que le trou existe,
 * deviennent rouges dès le correctif — QA_REPORT.md) :
 *   #E-01 : aucune RPC ne vérifie p_user = auth.uid() → A invoque l'économie
 *           au nom de B (pattern de fix proposé par A : auth.uid() is null or
 *           p_user = auth.uid(), qui laisse passer le service_role) ;
 *   #E-07 : get_public_profile plante (`uc.rarity` n'existe pas sur
 *           user_cards — 0007) pour tout joueur possédant des cartes.
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

  // P1 — QA_REPORT #E-07 : get_public_profile référence uc.rarity (absente de
  // user_cards — la rareté vit sur characters.base_rarity) → 42703 pour tout
  // joueur possédant des cartes. `it.fails` : passe tant que le bug existe.
  it.fails('profil public : get_public_profile fonctionne pour un joueur avec des cartes', async () => {
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

  // --- P0 authz (it.fails) : p_user arbitraire --------------------------------------

  // QA_REPORT #E-01 : aucune RPC ne vérifie p_user = auth.uid(). Avec un JWT
  // user lambda + la anon key, A invoque l'économie AU NOM de B. Les 3 preuves
  // passent tant que le trou existe ; elles deviennent rouges ("fails test
  // passed") dès l'application du pattern `auth.uid() is null or p_user = auth.uid()`.

  it.fails('AUTHZ : open_booster(p_user=B) refusé pour A (débit du stock de B)', async () => {
    const { error } = await a.rpc('open_booster', {
      p_user: userB,
      p_theme_slug: 'shonen',
      p_idempotency_key: freshKey(),
    });
    expect(error).not.toBeNull(); // Aujourd'hui : error === null → le trou est prouvé.
  });

  it.fails('AUTHZ : toggle_wishlist(p_user=B) refusé pour A (pollution de la wishlist de B)', async () => {
    const { data: others } = await anon.from('characters').select('id').order('anilist_id').limit(3);
    const { error } = await a.rpc('toggle_wishlist', {
      p_user: userB,
      p_character_id: others![2]!.id,
    });
    expect(error).not.toBeNull();
  });

  it.fails('AUTHZ : set_username(p_user=B) refusé pour A (renommage du profil de B)', async () => {
    const { error } = await a.rpc('set_username', {
      p_user: userB,
      p_username: `hacked_${Date.now().toString(36)}`,
    });
    expect(error).not.toBeNull();
  });
});
