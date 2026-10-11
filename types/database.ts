/**
 * types/database.ts — Types TypeScript du schéma Postgres, au format canonique
 * produit par `supabase gen types typescript` (la CLI Supabase n'étant pas
 * disponible ici, ce fichier est écrit à la main en suivant ce format exact).
 *
 * Source de vérité : supabase/schema.sql (tables, colonnes, nullabilité,
 * défauts) et supabase/migrations/0001_functions.sql (signatures des RPC).
 * Toute évolution du schéma DOIT se refléter ici — c'est le contrat des
 * agents A (route handlers) et E (tests).
 *
 * Notes de mapping fidèle au générateur officiel :
 * - Les contraintes CHECK textuelles (base_rarity, source, type cosmétique…)
 *   sont générées comme des colonnes `string`, PAS comme des Enums PG (le
 *   schéma n'utilise aucun vrai ENUM PostgreSQL → `Enums` est vide).
 * - `citext` (profiles.username) est généré comme `string`.
 * - `jsonb` est généré comme `Json` ; `text[]` comme `string[]`.
 * - `int8` (drops_log.id) est généré comme `number`.
 * - Dans `Insert`, seules les colonnes NOT NULL sans DEFAULT sont requises ;
 *   les colonnes nullable ou à défaut sont optionnelles (`?`).
 * - Pas de `as const` volontairement : le format du CLI est un `type` pur, et
 *   les tableaux mutables (Relationships, Args) doivent rester assignables aux
 *   génériques de @supabase/supabase-js (SupabaseClient<Database>).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      themes: {
        Row: {
          slug: string
          name_fr: string
          name_en: string
          icon: string | null
          pack_art_url: string | null
          sort_order: number
        }
        Insert: {
          slug: string
          name_fr: string
          name_en: string
          icon?: string | null
          pack_art_url?: string | null
          sort_order?: number
        }
        Update: {
          slug?: string
          name_fr?: string
          name_en?: string
          icon?: string | null
          pack_art_url?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      characters: {
        Row: {
          id: string
          anilist_id: number | null
          name_romaji: string
          name_native: string | null
          image_url: string
          image_url_fallback: string | null
          anime_title: string | null
          favourites: number
          base_rarity: string
          rarity_overridden: boolean
          themes: string[]
          print_count: number
          wishlist_count: number
        }
        Insert: {
          id?: string
          anilist_id?: number | null
          name_romaji: string
          name_native?: string | null
          image_url: string
          image_url_fallback?: string | null
          anime_title?: string | null
          favourites?: number
          base_rarity: string
          rarity_overridden?: boolean
          themes?: string[]
          print_count?: number
          wishlist_count?: number
        }
        Update: {
          id?: string
          anilist_id?: number | null
          name_romaji?: string
          name_native?: string | null
          image_url?: string
          image_url_fallback?: string | null
          anime_title?: string | null
          favourites?: number
          base_rarity?: string
          rarity_overridden?: boolean
          themes?: string[]
          print_count?: number
          wishlist_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          username: string | null
          chakra: number
          premium_points: number
          booster_count: number
          last_booster_recharge: string
          cards_obtained_count: number
          pity_legendary: number
          pity_mythic: number
          golden_counter: number
          login_streak: number
          last_login_date: string | null
          daily_pack_claimed: string | null
          created_at: string
        }
        Insert: {
          id: string
          username?: string | null
          chakra?: number
          premium_points?: number
          booster_count?: number
          last_booster_recharge?: string
          cards_obtained_count?: number
          pity_legendary?: number
          pity_mythic?: number
          golden_counter?: number
          login_streak?: number
          last_login_date?: string | null
          daily_pack_claimed?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          chakra?: number
          premium_points?: number
          booster_count?: number
          last_booster_recharge?: string
          cards_obtained_count?: number
          pity_legendary?: number
          pity_mythic?: number
          golden_counter?: number
          login_streak?: number
          last_login_date?: string | null
          daily_pack_claimed?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      cosmetics: {
        Row: {
          id: string
          slug: string
          type: string
          name_fr: string
          name_en: string
          chakra_price: number
          is_ultra_rare: boolean
          css_config: Json
        }
        Insert: {
          id?: string
          slug: string
          type: string
          name_fr: string
          name_en: string
          chakra_price: number
          is_ultra_rare?: boolean
          css_config: Json
        }
        Update: {
          id?: string
          slug?: string
          type?: string
          name_fr?: string
          name_en?: string
          chakra_price?: number
          is_ultra_rare?: boolean
          css_config?: Json
        }
        Relationships: []
      }
      user_cards: {
        Row: {
          id: string
          user_id: string
          character_id: string
          print_number: number
          first_owner: boolean
          frame_id: string | null
          holo_id: string | null
          dye_id: string | null
          source: string
          obtained_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id: string
          print_number: number
          first_owner?: boolean
          frame_id?: string | null
          holo_id?: string | null
          dye_id?: string | null
          source: string
          obtained_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          character_id?: string
          print_number?: number
          first_owner?: boolean
          frame_id?: string | null
          holo_id?: string | null
          dye_id?: string | null
          source?: string
          obtained_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_cards_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cards_character_id_fkey'
            columns: ['character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cards_frame_id_fkey'
            columns: ['frame_id']
            isOneToOne: false
            referencedRelation: 'cosmetics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cards_holo_id_fkey'
            columns: ['holo_id']
            isOneToOne: false
            referencedRelation: 'cosmetics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cards_dye_id_fkey'
            columns: ['dye_id']
            isOneToOne: false
            referencedRelation: 'cosmetics'
            referencedColumns: ['id']
          },
        ]
      }
      user_cosmetics: {
        Row: {
          user_id: string
          cosmetic_id: string
          obtained_at: string
        }
        Insert: {
          user_id: string
          cosmetic_id: string
          obtained_at?: string
        }
        Update: {
          user_id?: string
          cosmetic_id?: string
          obtained_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_cosmetics_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cosmetics_cosmetic_id_fkey'
            columns: ['cosmetic_id']
            isOneToOne: false
            referencedRelation: 'cosmetics'
            referencedColumns: ['id']
          },
        ]
      }
      wishlists: {
        Row: {
          user_id: string
          character_id: string
          added_at: string
        }
        Insert: {
          user_id: string
          character_id: string
          added_at?: string
        }
        Update: {
          user_id?: string
          character_id?: string
          added_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'wishlists_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'wishlists_character_id_fkey'
            columns: ['character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
        ]
      }
      quests: {
        Row: {
          id: string
          key: string
          type: string
          goal: number
          chakra_reward: number
          name_fr: string
          name_en: string
          active: boolean
        }
        Insert: {
          id?: string
          key: string
          type: string
          goal: number
          chakra_reward: number
          name_fr: string
          name_en: string
          active?: boolean
        }
        Update: {
          id?: string
          key?: string
          type?: string
          goal?: number
          chakra_reward?: number
          name_fr?: string
          name_en?: string
          active?: boolean
        }
        Relationships: []
      }
      user_quests: {
        Row: {
          user_id: string
          quest_id: string
          progress: number
          completed: boolean
          claimed: boolean
          day: string
        }
        Insert: {
          user_id: string
          quest_id: string
          progress?: number
          completed?: boolean
          claimed?: boolean
          day: string
        }
        Update: {
          user_id?: string
          quest_id?: string
          progress?: number
          completed?: boolean
          claimed?: boolean
          day?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_quests_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_quests_quest_id_fkey'
            columns: ['quest_id']
            isOneToOne: false
            referencedRelation: 'quests'
            referencedColumns: ['id']
          },
        ]
      }
      drops_log: {
        Row: {
          id: number
          user_id: string
          character_id: string
          rarity: string
          print_number: number
          source: string
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          character_id: string
          rarity: string
          print_number: number
          source: string
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          character_id?: string
          rarity?: string
          print_number?: number
          source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'drops_log_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'drops_log_character_id_fkey'
            columns: ['character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
        ]
      }
      idempotency_keys: {
        Row: {
          key: string
          user_id: string
          endpoint: string
          result: Json | null
          created_at: string
        }
        Insert: {
          key: string
          user_id: string
          endpoint: string
          result?: Json | null
          created_at?: string
        }
        Update: {
          key?: string
          user_id?: string
          endpoint?: string
          result?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'idempotency_keys_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      booster_openings: {
        Row: {
          id: string
          user_id: string
          theme_slug: string | null
          is_golden: boolean
          pity_legendary_after: number | null
          pity_mythic_after: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          theme_slug?: string | null
          is_golden?: boolean
          pity_legendary_after?: number | null
          pity_mythic_after?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          theme_slug?: string | null
          is_golden?: boolean
          pity_legendary_after?: number | null
          pity_mythic_after?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booster_openings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      /**
       * Ouverture d'un booster gratuit à thème (5 cartes). Les poids/taux
       * restent côté serveur (paramètres à DEFAULT jamais passés par le client).
       */
      open_booster: {
        Args: {
          p_user: string
          p_theme_slug: string
          p_idempotency_key: string
          p_weights?: Json
        }
        Returns: Json
      }
      open_premium_booster: {
        Args: {
          p_user: string
          p_idempotency_key: string
          p_weights?: Json
          p_guaranteed_legendary_chance?: number
        }
        Returns: Json
      }
      claim_daily_pack: {
        Args: {
          p_user: string
          p_idempotency_key: string
          p_weights?: Json
        }
        Returns: Json
      }
      burn_card: {
        Args: {
          p_user: string
          p_card_id: string
          p_idempotency_key: string
          p_burn_table?: Json
        }
        Returns: Json
      }
      update_quest_progress: {
        Args: {
          p_user: string
          p_type: string
          p_amount: number
        }
        Returns: undefined
      }
      ensure_daily_quests: {
        Args: {
          p_user: string
        }
        Returns: undefined
      }
      claim_quests: {
        Args: {
          p_user: string
          p_quest_ids: string[]
        }
        Returns: Json
      }
      update_login_streak: {
        Args: {
          p_user: string
        }
        Returns: Json
      }
      buy_cosmetic: {
        Args: {
          p_user: string
          p_cosmetic_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      apply_cosmetic: {
        Args: {
          p_user: string
          p_card_id: string
          p_cosmetic_id: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      reroll_cosmetic: {
        Args: {
          p_user: string
          p_card_id: string
          p_cosmetic_type: string
          p_idempotency_key: string
          p_cost?: number
        }
        Returns: Json
      }
      toggle_wishlist: {
        Args: {
          p_user: string
          p_character_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Alias de convenance (standard dans la sortie du CLI Supabase).
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
export type Functions<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]

export default Database
