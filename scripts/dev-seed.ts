/**
 * ============================================================================
 * DEV LOCAL UNIQUEMENT — NE JAMAIS EXÉCUTER CONTRE LA PRODUCTION.
 *
 * Script de seed de développement : crée 2 utilisateurs de test avec quelques
 * cartes, en passant EXCLUSIVEMENT par les RPC (aucun insert direct dans
 * user_cards — l'économie est 100 % serveur, même en seed). Les personnages
 * de test sont upsertés directement dans `characters` : ce n'est pas de
 * l'économie, c'est le pool de données (en prod, ce rôle est rempli par le
 * pipeline AniList/Jikan).
 *
 * Prérequis : Supabase local lancé (`supabase start`), migrations + seed SQL
 * appliqués (`supabase db reset`).
 *
 * Usage : npx tsx scripts/dev-seed.ts
 * Env   : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (lus depuis process.env ou
 *         un fichier .env local via process.loadEnvFile — jamais commité).
 * ============================================================================
 */

// Charge un éventuel .env local (Node >= 20.6). Silencieux s'il est absent :
// les variables peuvent aussi être exportées dans le shell.
try {
  process.loadEnvFile('.env');
} catch {
  // pas de .env : on se fie à l'environnement du process
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[dev-seed] SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (env ou .env local).'
  );
  process.exit(1);
}

// Client admin : bypass RLS. Service role = secret serveur, ce script est un
// outil de dev local, il ne doit JAMAIS tourner en prod ni côté client.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Personnages de test couvrant les 6 raretés et les 6 thèmes. */
const TEST_CHARACTERS = [
  { anilist_id: 900001, name_romaji: 'Goku Test', name_native: '悟空', anime_title: 'Dragon Ball Test', favourites: 50000, base_rarity: 'mythic', themes: ['shonen', 'big3'] },
  { anilist_id: 900002, name_romaji: 'Luffy Test', name_native: 'ルフィ', anime_title: 'One Piece Test', favourites: 40000, base_rarity: 'legendary', themes: ['shonen', 'big3'] },
  { anilist_id: 900003, name_romaji: 'Naruto Test', name_native: 'ナルト', anime_title: 'Naruto Test', favourites: 35000, base_rarity: 'legendary', themes: ['shonen', 'big3'] },
  { anilist_id: 900004, name_romaji: 'Ichigo Test', name_native: '一護', anime_title: 'Bleach Test', favourites: 30000, base_rarity: 'epic', themes: ['shonen', 'big3'] },
  { anilist_id: 900005, name_romaji: 'Sakura Test', name_native: 'さくら', anime_title: 'Cardcaptor Test', favourites: 20000, base_rarity: 'epic', themes: ['shojo'] },
  { anilist_id: 900006, name_romaji: 'Thorfinn Test', name_native: 'トルフィン', anime_title: 'Vinland Test', favourites: 15000, base_rarity: 'rare', themes: ['seinen'] },
  { anilist_id: 900007, name_romaji: 'Sung Jinwoo Test', name_native: '성진우', anime_title: 'Solo Test', favourites: 12000, base_rarity: 'rare', themes: ['webtoon'] },
  { anilist_id: 900008, name_romaji: 'Ainz Test', name_native: 'アインズ', anime_title: 'Overlord Test', favourites: 8000, base_rarity: 'uncommon', themes: ['isekai'] },
  { anilist_id: 900009, name_romaji: 'Kazuma Test', name_native: 'カズマ', anime_title: 'Konosuba Test', favourites: 6000, base_rarity: 'uncommon', themes: ['isekai'] },
  { anilist_id: 900010, name_romaji: 'Khun Test', name_native: '쿤', anime_title: 'Tower Test', favourites: 4000, base_rarity: 'common', themes: ['webtoon'] },
  { anilist_id: 900011, name_romaji: 'Usagi Test', name_native: 'うさぎ', anime_title: 'Sailor Test', favourites: 2500, base_rarity: 'common', themes: ['shojo'] },
  { anilist_id: 900012, name_romaji: 'Guts Test', name_native: 'ガッツ', anime_title: 'Berserk Test', favourites: 1000, base_rarity: 'common', themes: ['seinen', 'shonen'] },
] as const;

const TEST_USERS = [
  { email: 'dev-alice@manga-society.local', password: 'dev-password-1234', username: 'dev_alice' },
  { email: 'dev-bob@manga-society.local', password: 'dev-password-1234', username: 'dev_bob' },
] as const;

/** Chaque tentative appelle les RPC avec une NOUVELLE idempotency key. */
function freshKey(): string {
  return crypto.randomUUID();
}

async function main(): Promise<void> {
  // 1. Pool de personnages de test (upsert idempotent sur anilist_id).
  const { error: charError } = await supabase
    .from('characters')
    .upsert(
      TEST_CHARACTERS.map((c) => ({
        anilist_id: c.anilist_id,
        name_romaji: c.name_romaji,
        name_native: c.name_native,
        anime_title: c.anime_title,
        favourites: c.favourites,
        base_rarity: c.base_rarity,
        themes: [...c.themes],
        // image placeholder : le front doit gérer le fallback (silhouette).
        image_url: 'https://placehold.co/300x420/111827/94a3b8?text=Test',
        image_url_fallback: null,
      })),
      { onConflict: 'anilist_id' }
    );
  if (charError) throw new Error(`characters upsert: ${charError.message}`);
  console.log(`[dev-seed] ${TEST_CHARACTERS.length} personnages de test upsertés.`);

  // 2. Utilisateurs de test (création idempotente : on réutilise s'ils existent).
  for (const u of TEST_USERS) {
    const { data: existing } = await supabase.auth.admin.listUsers();
    const found = existing.users.find((usr) => usr.email === u.email);

    let userId: string;
    if (found) {
      userId = found.id;
      console.log(`[dev-seed] user ${u.email} déjà existant (${userId}), réutilisé.`);
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { username: u.username },
      });
      if (createError || !created.user) {
        throw new Error(`createUser ${u.email}: ${createError?.message ?? 'no user returned'}`);
      }
      userId = created.user.id;
      console.log(`[dev-seed] user créé : ${u.email} (${userId}) — profil via trigger handle_new_user.`);
    }

    // 3. Quelques cartes via les RPC (jamais d'insert direct des user_cards).
    for (const theme of ['shonen', 'isekai', 'webtoon'] as const) {
      const { data, error } = await supabase.rpc('open_booster', {
        p_user: userId,
        p_theme_slug: theme,
        p_idempotency_key: freshKey(),
      });
      if (error) {
        console.warn(`[dev-seed] open_booster(${theme}) pour ${u.email}: ${error.message} (NO_BOOSTER ?)`);
      } else {
        const result = data as { cards?: unknown[]; booster_count?: number };
        console.log(
          `[dev-seed] open_booster(${theme}) ok pour ${u.email}: ${result.cards?.length ?? 0} cartes, stock restant ${result.booster_count}.`
        );
      }
    }

    // Pack du jour (peut échouer ALREADY_CLAIMED si le seed a déjà tourné
    // aujourd'hui — c'est attendu, on continue).
    const { error: dailyError } = await supabase.rpc('claim_daily_pack', {
      p_user: userId,
      p_idempotency_key: freshKey(),
    });
    if (dailyError) {
      console.warn(`[dev-seed] claim_daily_pack pour ${u.email}: ${dailyError.message}`);
    } else {
      console.log(`[dev-seed] claim_daily_pack ok pour ${u.email}.`);
    }

    // Streak du jour (no-op si déjà appelé aujourd'hui).
    const { error: streakError } = await supabase.rpc('update_login_streak', {
      p_user: userId,
    });
    if (streakError) {
      console.warn(`[dev-seed] update_login_streak pour ${u.email}: ${streakError.message}`);
    }

    // Wishlist : un toggle pour donner du grain à tester.
    const { data: aChar } = await supabase
      .from('characters')
      .select('id')
      .eq('anilist_id', 900001)
      .single();
    if (aChar) {
      const { error: wishError } = await supabase.rpc('toggle_wishlist', {
        p_user: userId,
        p_character_id: aChar.id,
      });
      if (wishError) {
        console.warn(`[dev-seed] toggle_wishlist pour ${u.email}: ${wishError.message}`);
      }
    }
  }

  console.log("[dev-seed] Terminé. Connexion des users de test : email magic link désactivé en local,");
  console.log("[dev-seed] utilisez le mot de passe dev-password-1234 via l'API auth email.");
}

main().catch((err: unknown) => {
  console.error('[dev-seed] Échec :', err);
  process.exit(1);
});
