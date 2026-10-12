export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      booster_openings: {
        Row: {
          created_at: string
          id: string
          is_golden: boolean
          pity_legendary_after: number | null
          pity_mythic_after: number | null
          theme_slug: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_golden?: boolean
          pity_legendary_after?: number | null
          pity_mythic_after?: number | null
          theme_slug?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_golden?: boolean
          pity_legendary_after?: number | null
          pity_mythic_after?: number | null
          theme_slug?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booster_openings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          anilist_id: number | null
          anime_title: string | null
          base_rarity: string
          favourites: number
          id: string
          image_url: string
          image_url_fallback: string | null
          name_native: string | null
          name_romaji: string
          print_count: number
          rarity_overridden: boolean
          themes: string[]
          wishlist_count: number
        }
        Insert: {
          anilist_id?: number | null
          anime_title?: string | null
          base_rarity: string
          favourites?: number
          id?: string
          image_url: string
          image_url_fallback?: string | null
          name_native?: string | null
          name_romaji: string
          print_count?: number
          rarity_overridden?: boolean
          themes?: string[]
          wishlist_count?: number
        }
        Update: {
          anilist_id?: number | null
          anime_title?: string | null
          base_rarity?: string
          favourites?: number
          id?: string
          image_url?: string
          image_url_fallback?: string | null
          name_native?: string | null
          name_romaji?: string
          print_count?: number
          rarity_overridden?: boolean
          themes?: string[]
          wishlist_count?: number
        }
        Relationships: []
      }
      cosmetics: {
        Row: {
          chakra_price: number
          css_config: Json
          id: string
          is_ultra_rare: boolean
          name_en: string
          name_fr: string
          slug: string
          type: string
        }
        Insert: {
          chakra_price: number
          css_config: Json
          id?: string
          is_ultra_rare?: boolean
          name_en: string
          name_fr: string
          slug: string
          type: string
        }
        Update: {
          chakra_price?: number
          css_config?: Json
          id?: string
          is_ultra_rare?: boolean
          name_en?: string
          name_fr?: string
          slug?: string
          type?: string
        }
        Relationships: []
      }
      drops_log: {
        Row: {
          character_id: string
          created_at: string
          id: number
          print_number: number
          rarity: string
          source: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: never
          print_number: number
          rarity: string
          source: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: never
          print_number?: number
          rarity?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drops_log_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drops_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          endpoint: string
          key: string
          result: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          key: string
          result?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          key?: string
          result?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          booster_count: number
          cards_obtained_count: number
          chakra: number
          created_at: string
          daily_pack_claimed: string | null
          golden_counter: number
          id: string
          last_booster_recharge: string
          last_login_date: string | null
          login_streak: number
          pity_legendary: number
          pity_mythic: number
          premium_points: number
          showcase_card_ids: string[]
          username: string | null
        }
        Insert: {
          booster_count?: number
          cards_obtained_count?: number
          chakra?: number
          created_at?: string
          daily_pack_claimed?: string | null
          golden_counter?: number
          id: string
          last_booster_recharge?: string
          last_login_date?: string | null
          login_streak?: number
          pity_legendary?: number
          pity_mythic?: number
          premium_points?: number
          showcase_card_ids?: string[]
          username?: string | null
        }
        Update: {
          booster_count?: number
          cards_obtained_count?: number
          chakra?: number
          created_at?: string
          daily_pack_claimed?: string | null
          golden_counter?: number
          id?: string
          last_booster_recharge?: string
          last_login_date?: string | null
          login_streak?: number
          pity_legendary?: number
          pity_mythic?: number
          premium_points?: number
          showcase_card_ids?: string[]
          username?: string | null
        }
        Relationships: []
      }
      quests: {
        Row: {
          active: boolean
          chakra_reward: number
          goal: number
          id: string
          key: string
          name_en: string
          name_fr: string
          type: string
        }
        Insert: {
          active?: boolean
          chakra_reward: number
          goal: number
          id?: string
          key: string
          name_en: string
          name_fr: string
          type: string
        }
        Update: {
          active?: boolean
          chakra_reward?: number
          goal?: number
          id?: string
          key?: string
          name_en?: string
          name_fr?: string
          type?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          icon: string | null
          name_en: string
          name_fr: string
          pack_art_url: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          icon?: string | null
          name_en: string
          name_fr: string
          pack_art_url?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          icon?: string | null
          name_en?: string
          name_fr?: string
          pack_art_url?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_cards: {
        Row: {
          character_id: string
          dye_id: string | null
          first_owner: boolean
          frame_id: string | null
          holo_id: string | null
          id: string
          obtained_at: string
          print_number: number
          source: string
          user_id: string
        }
        Insert: {
          character_id: string
          dye_id?: string | null
          first_owner?: boolean
          frame_id?: string | null
          holo_id?: string | null
          id?: string
          obtained_at?: string
          print_number: number
          source: string
          user_id: string
        }
        Update: {
          character_id?: string
          dye_id?: string | null
          first_owner?: boolean
          frame_id?: string | null
          holo_id?: string | null
          id?: string
          obtained_at?: string
          print_number?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cards_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cards_dye_id_fkey"
            columns: ["dye_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cards_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cards_holo_id_fkey"
            columns: ["holo_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cosmetics: {
        Row: {
          cosmetic_id: string
          obtained_at: string
          user_id: string
        }
        Insert: {
          cosmetic_id: string
          obtained_at?: string
          user_id: string
        }
        Update: {
          cosmetic_id?: string
          obtained_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cosmetics_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cosmetics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quests: {
        Row: {
          claimed: boolean
          completed: boolean
          day: string
          progress: number
          quest_id: string
          user_id: string
        }
        Insert: {
          claimed?: boolean
          completed?: boolean
          day: string
          progress?: number
          quest_id: string
          user_id: string
        }
        Update: {
          claimed?: boolean
          completed?: boolean
          day?: string
          progress?: number
          quest_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quests_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          added_at: string
          character_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          character_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          character_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_guarantees: {
        Args: { p_pg: Json; p_tiers: string[] }
        Returns: string[]
      }
      _apply_pity_and_golden: { Args: { p_user: string }; Returns: Json }
      _assert_self: { Args: { p_user: string }; Returns: undefined }
      _card_json: {
        Args: {
          c: Database["public"]["Tables"]["characters"]["Row"]
          d: Database["public"]["Tables"]["cosmetics"]["Row"]
          f: Database["public"]["Tables"]["cosmetics"]["Row"]
          h: Database["public"]["Tables"]["cosmetics"]["Row"]
          uc: Database["public"]["Tables"]["user_cards"]["Row"]
        }
        Returns: Json
      }
      _character_summary: {
        Args: { c: Database["public"]["Tables"]["characters"]["Row"] }
        Returns: Json
      }
      _cosmetic_json: {
        Args: { c: Database["public"]["Tables"]["cosmetics"]["Row"] }
        Returns: Json
      }
      _grant_card: {
        Args: { p_character_id: string; p_source: string; p_user: string }
        Returns: Json
      }
      _idempotency_begin: {
        Args: { p_endpoint: string; p_key: string; p_user: string }
        Returns: Json
      }
      _idempotency_store: {
        Args: { p_key: string; p_result: Json }
        Returns: undefined
      }
      _lock_characters_sorted: { Args: { p_ids: string[] }; Returns: undefined }
      _next_paris_midnight: { Args: never; Returns: string }
      _paris_today: { Args: never; Returns: string }
      _pick_character: {
        Args: { p_rarity: string; p_theme_slug: string }
        Returns: string
      }
      _rarity_rank: { Args: { p_rarity: string }; Returns: number }
      _require_profile: { Args: { p_user: string }; Returns: undefined }
      _roll_rarity: { Args: { p_weights: Json }; Returns: string }
      apply_cosmetic: {
        Args: {
          p_card_id: string
          p_cosmetic_id: string
          p_idempotency_key: string
          p_user: string
        }
        Returns: Json
      }
      burn_card: {
        Args: {
          p_burn_table?: Json
          p_card_id: string
          p_idempotency_key: string
          p_user: string
        }
        Returns: Json
      }
      buy_cosmetic: {
        Args: {
          p_cosmetic_id: string
          p_idempotency_key: string
          p_user: string
        }
        Returns: Json
      }
      check_username: { Args: { p_username: string }; Returns: Json }
      claim_daily_pack: {
        Args: { p_idempotency_key: string; p_user: string; p_weights?: Json }
        Returns: Json
      }
      claim_quests: {
        Args: { p_quest_ids: string[]; p_user: string }
        Returns: Json
      }
      ensure_daily_quests: { Args: { p_user: string }; Returns: undefined }
      get_album: { Args: { p_user: string }; Returns: Json }
      get_booster_state: { Args: { p_user: string }; Returns: Json }
      get_card_detail: {
        Args: { p_card_id: string; p_user: string }
        Returns: Json
      }
      get_collection_page: {
        Args: {
          p_cursor?: Json
          p_limit?: number
          p_rarity?: string
          p_search?: string
          p_sort?: string
          p_theme?: string
          p_user: string
        }
        Returns: Json
      }
      get_daily_quests: { Args: { p_user: string }; Returns: Json }
      get_next_reset_at: { Args: never; Returns: string }
      get_public_profile: { Args: { p_username: string }; Returns: Json }
      get_theme_pool_info: {
        Args: { p_slug: string; p_user: string }
        Returns: Json
      }
      get_wishlist: { Args: { p_user: string }; Returns: Json }
      open_booster: {
        Args: {
          p_idempotency_key: string
          p_theme_slug: string
          p_user: string
          p_weights?: Json
        }
        Returns: Json
      }
      open_premium_booster: {
        Args: {
          p_guaranteed_legendary_chance?: number
          p_idempotency_key: string
          p_user: string
          p_weights?: Json
        }
        Returns: Json
      }
      reroll_cosmetic: {
        Args: {
          p_card_id: string
          p_cosmetic_type: string
          p_cost?: number
          p_idempotency_key: string
          p_user: string
        }
        Returns: Json
      }
      set_showcase: {
        Args: { p_card_ids: string[]; p_user: string }
        Returns: Json
      }
      set_username: {
        Args: { p_user: string; p_username: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      toggle_wishlist: {
        Args: { p_character_id: string; p_max_slots?: number; p_user: string }
        Returns: Json
      }
      update_login_streak: {
        Args: {
          p_chakra_by_day?: number[]
          p_cosmetic_reward_day?: number
          p_user: string
        }
        Returns: Json
      }
      update_quest_progress: {
        Args: { p_amount: number; p_type: string; p_user: string }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
