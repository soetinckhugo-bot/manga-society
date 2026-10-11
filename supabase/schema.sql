-- ============================================================================
-- MANGA SOCIETY — Schéma Postgres complet
--
-- Règles transverses (STANDARDS COMMUNS) :
--   * Économie 100 % serveur : toute mutation passe par les RPC SECURITY
--     DEFINER de supabase/migrations/0001_functions.sql. RLS deny-by-default
--     sur TOUTES les tables : aucune policy = aucun accès.
--   * Dates serveur = NOW(). Les resets quotidiens (quêtes, pack du jour,
--     streak) utilisent (now() at time zone 'Europe/Paris')::date.
--   * Atomicité du print : UPDATE characters SET print_count = print_count + 1
--     ... RETURNING + contrainte unique (character_id, print_number) =
--     filet de sécurité ultime contre toute concurrence.
-- ============================================================================

create extension if not exists citext;   -- usernames insensibles à la casse
create extension if not exists pgcrypto; -- gen_random_uuid() (idempotency côté client, randomness serveur)
create extension if not exists pg_trgm;  -- recherche floue sur les noms de persos

-- ----------------------------------------------------------------------------
-- themes : les 6 univers de boosters (Shonen, Shojo, Webtoon, Big 3, ...)
-- ----------------------------------------------------------------------------
create table if not exists public.themes (
  slug       text primary key,
  name_fr    text not null,
  name_en    text not null,
  icon       text,                          -- nom d'icône lucide (frontend)
  pack_art_url text,                        -- art du booster (Agent Juice)
  sort_order int not null default 0         -- ordre d'affichage + rotation du pack du jour
);

comment on table  public.themes              is 'Univers de boosters. Lecture publique. La rotation du pack du jour est déterministe sur sort_order.';
comment on column public.themes.slug         is 'Clé stable utilisée partout (characters.themes[], booster_openings, daily pack).';
comment on column public.themes.sort_order   is 'Ordre d''affichage ET base de la rotation journalière (nb de jours depuis epoch % nb de thèmes).';

-- ----------------------------------------------------------------------------
-- characters : les personnages (pool du jeu, rempli par le pipeline AniList/Jikan)
-- ----------------------------------------------------------------------------
create table if not exists public.characters (
  id                 uuid primary key default gen_random_uuid(),
  anilist_id         int unique,
  name_romaji        text not null,
  name_native        text,
  image_url          text not null,
  image_url_fallback text,
  anime_title        text,
  favourites         int not null default 0, -- popularité AniList (base du percentile de rareté)
  base_rarity        text not null check (base_rarity in
                       ('common','uncommon','rare','epic','legendary','mythic')),
  rarity_overridden  boolean not null default false, -- true = rareté fixée manuellement, le pipeline ne la recalcule pas
  themes             text[] not null default '{}',   -- slugs de themes ; un perso peut avoir plusieurs thèmes
  print_count        int not null default 0 check (print_count >= 0),  -- nb d'exemplaires imprimés (atomique, jamais recyclé)
  wishlist_count     int not null default 0 check (wishlist_count >= 0) -- demande : pèse sur la valeur de burn
);

comment on table  public.characters                 is 'Pool de personnages. Écrit par le pipeline (service role), lu publiquement. print_count et wishlist_count mutés UNIQUEMENT par les RPC.';
comment on column public.characters.base_rarity       is 'Rareté intrinsèque sur 6 tiers, calculée par percentile de favourites AniList, overridable (rarity_overridden).';
comment on column public.characters.print_count       is 'Compteur de prints émis pour ce perso. Incrémenté par UPDATE ... +1 ... RETURNING dans chaque RPC d''ouverture : atomique même sous concurrence.';
comment on column public.characters.wishlist_count    is 'Nombre de joueurs ayant ce perso en wishlist. Entretien par toggle_wishlist (plancher 0). Pèse sur la burn value.';
comment on column public.characters.themes            is 'Slugs des thèmes auxquels le perso appartient (tags). Un perso Big 3 est aussi shonen.';

-- ----------------------------------------------------------------------------
-- profiles : un profil de jeu par utilisateur auth (créé par trigger handle_new_user)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  username              citext unique,
  chakra                int  not null default 0 check (chakra >= 0),          -- monnaie douce (burn, quêtes, streak)
  premium_points        int  not null default 0 check (premium_points >= 0), -- 10 pts = booster premium
  booster_count         int  not null default 10 check (booster_count between 0 and 10),
  last_booster_recharge timestamptz not null default now(),                    -- ancre de la recharge +1 / 6 min
  cards_obtained_count  int  not null default 0 check (cards_obtained_count >= 0), -- +1 pt premium par tranche de 100
  pity_legendary        int  not null default 0 check (pity_legendary between 0 and 25),  -- L garanti au plus tous les 25
  pity_mythic           int  not null default 0 check (pity_mythic between 0 and 200),    -- M garanti au plus tous les 200
  golden_counter        int  not null default 0 check (golden_counter between 0 and 9),   -- à 9 → ouverture dorée (taux ×2)
  login_streak          int  not null default 0 check (login_streak >= 0),
  last_login_date       date,                       -- jour Europe/Paris du dernier login (streak)
  daily_pack_claimed    date,                       -- jour Europe/Paris du dernier pack du jour
  created_at            timestamptz not null default now()
);

comment on table  public.profiles                   is 'Profil de jeu. Toutes les mutations économiques passent par les RPC SECURITY DEFINER ; l''utilisateur ne lit/met à jour que SA ligne (RLS).';
comment on column public.profiles.booster_count     is 'Stock de boosters gratuits (cap 10). Rechargé +1 / 6 min, logique UNIQUEMENT dans open_booster.';
comment on column public.profiles.pity_legendary    is 'Nb d''ouvertures depuis la dernière L (garantie à 25). Incrémenté par chaque ouverture (booster, premium, daily).';
comment on column public.profiles.pity_mythic       is 'Nb d''ouvertures depuis la dernière M (garantie à 200).';
comment on column public.profiles.golden_counter    is 'Compteur avant booster doré : à 9, l''ouverture courante est dorée (taux ×2) et le compteur repart à 0.';

-- ----------------------------------------------------------------------------
-- cosmetics : frames / holos / dyes, rendus 100 % CSS via css_config
-- ----------------------------------------------------------------------------
create table if not exists public.cosmetics (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,      -- convention findable, ex. 'streak-7' (récompense de streak jour 7)
  type          text not null check (type in ('frame','holo','dye')),
  name_fr       text not null,
  name_en       text not null,
  chakra_price  int  not null check (chakra_price >= 0),
  is_ultra_rare boolean not null default false,
  css_config    jsonb not null             -- tokens CSS pilotant le rendu (Agent Juice) — jamais de code par cosmétique
);

comment on table  public.cosmetics         is 'Catalogue de cosmétiques. Lecture publique. Achat/application/reroll via RPC uniquement.';
comment on column public.cosmetics.css_config is 'Tokens CSS (couleurs, gradients, animations) consommés par le composant carte.';

-- ----------------------------------------------------------------------------
-- user_cards : les cartes possédées (double rareté : perso + print Karuta)
-- ----------------------------------------------------------------------------
create table if not exists public.user_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references public.characters(id),
  print_number int  not null check (print_number > 0),  -- séquentiel PAR PERSONNAGE, gravé à l'obtention, jamais recyclé
  first_owner  boolean not null default true,           -- true si obtenue dans un booster/premium/daily par soi-même
  frame_id     uuid references public.cosmetics(id),
  holo_id      uuid references public.cosmetics(id),
  dye_id       uuid references public.cosmetics(id),
  source       text not null check (source in ('booster','premium','daily','quest')),
  obtained_at  timestamptz not null default now(),
  unique(character_id, print_number)  -- FILET DE SÉCURITÉ ULTIME : deux prints identiques = crash loud, pas de corruption
);

comment on table  public.user_cards                    is 'Cartes possédées. Insert UNIQUEMENT via les RPC (qui gèrent l''atomicité du print). Lecture limitée au propriétaire (RLS).';
comment on column public.user_cards.print_number       is 'Print Karuta : n° séquentiel du perso (le Goku #1, le Luffy #1). Attribué par UPDATE characters ... RETURNING print_count, garanti unique par la contrainte.';
comment on column public.user_cards.first_owner        is 'Badge « Premier détenteur » : true si source in (booster, premium, daily), false pour quêtes/cadeaux.';
comment on column public.user_cards.source             is 'Origine d''obtention : booster | premium | daily | quest.';

-- ----------------------------------------------------------------------------
-- user_cosmetics : inventaire cosmétiques du joueur
-- ----------------------------------------------------------------------------
create table if not exists public.user_cosmetics (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id uuid not null references public.cosmetics(id),
  obtained_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

-- ----------------------------------------------------------------------------
-- wishlists : 10 slots max par joueur (RLS + cap appliqué par toggle_wishlist)
-- ----------------------------------------------------------------------------
create table if not exists public.wishlists (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (user_id, character_id)
);

comment on table public.wishlists is 'Wishlist (10 slots max). Toggle + cap appliqués par RPC toggle_wishlist, qui entretient characters.wishlist_count.';

-- ----------------------------------------------------------------------------
-- quests : pool de quêtes quotidiennes (génération du jour dans ensure_daily_quests)
-- ----------------------------------------------------------------------------
create table if not exists public.quests (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,   -- clé stable côté config/UI
  type         text not null,          -- type métier progressé par update_quest_progress
  goal         int  not null check (goal > 0),
  chakra_reward int not null check (chakra_reward >= 0),
  name_fr      text not null,
  name_en      text not null,
  active       boolean not null default true
);

comment on column public.quests.type is 'Type métier progressé côté serveur : open_boosters | burn_cards | obtain_epic_plus | wishlist_add | claim_daily_pack.';

-- ----------------------------------------------------------------------------
-- user_quests : les 3 quêtes du jour par joueur (pk = idempotence par jour)
-- ----------------------------------------------------------------------------
create table if not exists public.user_quests (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id),
  progress int  not null default 0 check (progress >= 0),
  completed boolean not null default false,
  claimed   boolean not null default false,
  day       date not null,             -- jour Europe/Paris : rejouer le même jour = no-op idempotent
  primary key (user_id, quest_id, day)
);

comment on table public.user_quests is 'Quêtes du jour d''un joueur. Générées par ensure_daily_quests (3 random du pool actif, randomness serveur).';

-- ----------------------------------------------------------------------------
-- drops_log : journal d'audit des tirages. INSERT via RPC uniquement, AUCUNE lecture utilisateur.
-- ----------------------------------------------------------------------------
create table if not exists public.drops_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  character_id uuid not null references public.characters(id),
  rarity       text not null check (rarity in ('common','uncommon','rare','epic','legendary','mythic')),
  print_number int  not null,
  source       text not null check (source in ('booster','premium','daily','quest')),
  created_at   timestamptz not null default now()
);

comment on table public.drops_log is 'Audit trail des tirages (test Agent E : drops_log complet). RLS : aucune policy = aucun accès anon/authenticated ; les RPC (SECURITY DEFINER) écrivent en contournant la RLS.';

-- ----------------------------------------------------------------------------
-- idempotency_keys : filet anti double-clic / retry réseau (1 par tentative de clic)
-- ----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  key        uuid primary key,         -- uuid v4 généré côté client À CHAQUE tentative de clic
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  result     jsonb,                    -- null = appel en cours (concurrence même clé → IDEMPOTENCY_IN_PROGRESS)
  created_at timestamptz not null default now()
);

comment on table public.idempotency_keys is 'Idempotence des mutations d''économie : INSERT ON CONFLICT (key) DO NOTHING → early return du résultat stocké. Jamais deux débits pour la même clé.';

-- ----------------------------------------------------------------------------
-- booster_openings : historique des ouvertures (replay de la séquence, stats pity)
-- ----------------------------------------------------------------------------
create table if not exists public.booster_openings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  theme_slug         text,             -- null = booster premium (pas de thème)
  is_golden          boolean not null default false,
  pity_legendary_after int check (pity_legendary_after between 0 and 25),
  pity_mythic_after    int check (pity_mythic_after between 0 and 200),
  created_at         timestamptz not null default now()
);

comment on table public.booster_openings is 'Historique des ouvertures (séquence rejouable depuis l''historique, stats). Insert via RPC, lecture propriétaire.';

-- ============================================================================
-- INDEX — tous les filtres de la collection et les lookups FK/roll
-- ============================================================================

-- Collection d'un joueur, triée par date d'obtention
create index if not exists user_cards_user_obtained_idx on public.user_cards (user_id, obtained_at desc);
-- Recherche "qui possède ce perso" + jointures carte → perso
create index if not exists user_cards_character_idx    on public.user_cards (character_id);
-- Filtre rareté côté characters + jointure collection
create index if not exists characters_base_rarity_idx  on public.characters (base_rarity);
-- Filtre thème (tableau de slugs)
create index if not exists characters_themes_gin_idx   on public.characters using gin (themes);
-- Recherche de persos (floue, insensible à la casse)
create index if not exists characters_name_romaji_trgm_idx on public.characters using gin (lower(name_romaji) gin_trgm_ops);
-- Classements "plus possédés / plus convoités"
create index if not exists characters_print_count_idx      on public.characters (print_count desc);
create index if not exists characters_wishlist_count_idx   on public.characters (wishlist_count desc);
-- Pool de roll : persos d'un thème + rareté (le GIN themes + le btree
-- base_rarity ci-dessus couvrent déjà ce lookup combiné).
-- FK / lookups
create index if not exists user_cosmetics_cosmetic_idx on public.user_cosmetics (cosmetic_id);
create index if not exists user_quests_day_idx         on public.user_quests (day);
create index if not exists drops_log_user_idx          on public.drops_log (user_id, created_at desc);
create index if not exists idempotency_keys_user_idx   on public.idempotency_keys (user_id, created_at desc);
create index if not exists booster_openings_user_idx   on public.booster_openings (user_id, created_at desc);
create index if not exists profiles_username_idx       on public.profiles (username);

-- ============================================================================
-- RLS — deny-by-default partout, policies explicites
-- ============================================================================

alter table public.themes           enable row level security;
alter table public.characters       enable row level security;
alter table public.profiles         enable row level security;
alter table public.cosmetics        enable row level security;
alter table public.user_cards       enable row level security;
alter table public.user_cosmetics   enable row level security;
alter table public.wishlists        enable row level security;
alter table public.quests           enable row level security;
alter table public.user_quests      enable row level security;
alter table public.drops_log        enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.booster_openings enable row level security;

-- Tables publiques en lecture (anon + authenticated), aucune écriture directe
create policy "themes lecture publique"
  on public.themes for select to anon, authenticated using (true);
create policy "characters lecture publique"
  on public.characters for select to anon, authenticated using (true);
create policy "cosmetics lecture publique"
  on public.cosmetics for select to anon, authenticated using (true);
create policy "quests lecture publique"
  on public.quests for select to anon, authenticated using (true);

-- Données utilisateur : propriétaire uniquement (SELECT + UPDATE ; les INSERT
-- passent par les RPC SECURITY DEFINER qui contournent la RLS en tant que owner)
create policy "profiles select proprietaire"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles update proprietaire"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "user_cards select proprietaire"
  on public.user_cards for select to authenticated using (auth.uid() = user_id);
create policy "user_cards update proprietaire"
  on public.user_cards for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_cosmetics select proprietaire"
  on public.user_cosmetics for select to authenticated using (auth.uid() = user_id);
create policy "user_cosmetics update proprietaire"
  on public.user_cosmetics for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "wishlists select proprietaire"
  on public.wishlists for select to authenticated using (auth.uid() = user_id);
create policy "wishlists update proprietaire"
  on public.wishlists for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_quests select proprietaire"
  on public.user_quests for select to authenticated using (auth.uid() = user_id);
create policy "user_quests update proprietaire"
  on public.user_quests for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- drops_log : INSERT via RPC uniquement (SECURITY DEFINER), AUCUNE lecture utilisateur.
-- Pas de policy = deny-by-default total.
-- (audit Agent E : drops_log insert-only)

-- idempotency_keys : propriétaire uniquement (lecture ; les INSERT sont faits par les RPC)
create policy "idempotency_keys select proprietaire"
  on public.idempotency_keys for select to authenticated using (auth.uid() = user_id);

-- booster_openings : historique du joueur
create policy "booster_openings select proprietaire"
  on public.booster_openings for select to authenticated using (auth.uid() = user_id);

-- ============================================================================
-- PRIVILÈGES — deny-by-default au niveau GRANT, pas seulement RLS.
-- Supabase accorde ALL aux rôles anon/authenticated par défaut : on révoque
-- tout puis on ne redonne QUE le nécessaire. Effet net :
--   * lecture publique des tables publiques ;
--   * lecture propriétaire des tables privées (RLS) ;
--   * SEUL update direct autorisé = profiles.username (choix du pseudo).
--     Toute colonne économique (chakra, booster_count, pity, points, cartes…)
--     n'est joignable QUE par les RPC SECURITY DEFINER. Un client authentifié
--     ne peut donc pas se créditer de chakra/points ni forcer un print.
-- ============================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select on public.themes,
                public.characters,
                public.cosmetics,
                public.quests
  to anon, authenticated;

grant select on public.user_cards,
                public.user_cosmetics,
                public.wishlists,
                public.user_quests,
                public.profiles,
                public.idempotency_keys,
                public.booster_openings
  to authenticated;

-- Update direct : username uniquement (la policy RLS vérifie auth.uid() = id).
-- Toute autre colonne = RPC uniquement.
grant update (username) on public.profiles to authenticated;
