export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // TODO(item-2): replace this manual compatibility fallback with fully regenerated
      // Supabase types. Lore tables below are explicitly typed; the catch-all preserves
      // existing legacy repository calls for tables not represented in this stale file.
      [key: string]: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      users: {
        Row: {
          id: string
          eth_address: string
          created_at: string
          last_login_at: string
          login_count: number
        }
        Insert: {
          id?: string
          eth_address: string
          created_at?: string
          last_login_at?: string
          login_count?: number
        }
        Update: {
          id?: string
          eth_address?: string
          created_at?: string
          last_login_at?: string
          login_count?: number
        }
        Relationships: []
      }
      characters: {
        Row: {
          id: string
          token_id: number
          contract_address: string
          owner_address: string | null
          name: string | null
          class: string | null
          level: number
          experience: number
          str: number
          dex: number
          con: number
          int: number
          wis: number
          cha: number
          hp: number
          max_hp: number
          ac: number
          speed: number
          background_story: string | null
          equipment: Json | null
          metadata: Json | null
          burned: boolean
          infection_status: string
          staking_status: string
          image_url: string
          location_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          token_id: number
          contract_address: string
          owner_address?: string | null
          name?: string | null
          class?: string | null
          level?: number
          experience?: number
          str?: number
          dex?: number
          con?: number
          int?: number
          wis?: number
          cha?: number
          hp?: number
          max_hp?: number
          ac?: number
          speed?: number
          background_story?: string | null
          equipment?: Json | null
          metadata?: Json | null
          burned?: boolean
          infection_status?: string
          staking_status?: string
          image_url?: string
          location_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          token_id?: number
          contract_address?: string
          owner_address?: string | null
          name?: string | null
          class?: string | null
          level?: number
          experience?: number
          str?: number
          dex?: number
          con?: number
          int?: number
          wis?: number
          cha?: number
          hp?: number
          max_hp?: number
          ac?: number
          speed?: number
          background_story?: string | null
          equipment?: Json | null
          metadata?: Json | null
          burned?: boolean
          infection_status?: string
          staking_status?: string
          image_url?: string
          location_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Existing tweets consumers expect a different shape than this stale generated file had.
      // Keep it loose until full Supabase type regeneration covers all non-lore tables.
      tweets: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          name: string
          description: string | null
          image_url: string | null
          lore: string | null
          chain_location_id: number | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          image_url?: string | null
          lore?: string | null
          chain_location_id?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          image_url?: string | null
          lore?: string | null
          chain_location_id?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lore_canonization_overrides: {
        Row: {
          event_id: string
          status: string
          stage_id: string
          note: string | null
          path: Json
          publication_status: string
          published_status: string | null
          published_stage_id: string | null
          published_note: string | null
          published_path: Json | null
          updated_by: string
          published_by: string | null
          published_at: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          event_id: string
          status: string
          stage_id: string
          note?: string | null
          path?: Json
          publication_status?: string
          published_status?: string | null
          published_stage_id?: string | null
          published_note?: string | null
          published_path?: Json | null
          updated_by: string
          published_by?: string | null
          published_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          event_id?: string
          status?: string
          stage_id?: string
          note?: string | null
          path?: Json
          publication_status?: string
          published_status?: string | null
          published_stage_id?: string | null
          published_note?: string | null
          published_path?: Json | null
          updated_by?: string
          published_by?: string | null
          published_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      lore_submissions: {
        Row: {
          id: string
          submitter_address: string
          token_id: string
          title: string
          summary: string
          body_markdown: string
          tags: string[]
          curated_title: string | null
          curated_summary: string | null
          curated_body_markdown: string | null
          curated_tags: string[] | null
          season_id: string | null
          character_ids: string[]
          location_ids: string[]
          status: string
          review_note: string | null
          status_reason: string | null
          last_admin_address: string | null
          published_slug: string | null
          visibility: string
          published_kind: string | null
          canon_status: string
          canon_stage_id: string
          canon_note: string | null
          canon_path: Json
          publication_snapshot: Json | null
          created_at: string
          updated_at: string
          submitted_at: string
          reviewed_at: string | null
          published_at: string | null
          canonized_at: string | null
          closed_at: string | null
        }
        Insert: {
          id?: string
          submitter_address: string
          token_id: string
          title: string
          summary: string
          body_markdown: string
          tags?: string[]
          curated_title?: string | null
          curated_summary?: string | null
          curated_body_markdown?: string | null
          curated_tags?: string[] | null
          season_id?: string | null
          character_ids?: string[]
          location_ids?: string[]
          status?: string
          review_note?: string | null
          status_reason?: string | null
          last_admin_address?: string | null
          published_slug?: string | null
          visibility?: string
          published_kind?: string | null
          canon_status?: string
          canon_stage_id?: string
          canon_note?: string | null
          canon_path?: Json
          publication_snapshot?: Json | null
          created_at?: string
          updated_at?: string
          submitted_at?: string
          reviewed_at?: string | null
          published_at?: string | null
          canonized_at?: string | null
          closed_at?: string | null
        }
        Update: {
          id?: string
          submitter_address?: string
          token_id?: string
          title?: string
          summary?: string
          body_markdown?: string
          tags?: string[]
          curated_title?: string | null
          curated_summary?: string | null
          curated_body_markdown?: string | null
          curated_tags?: string[] | null
          season_id?: string | null
          character_ids?: string[]
          location_ids?: string[]
          status?: string
          review_note?: string | null
          status_reason?: string | null
          last_admin_address?: string | null
          published_slug?: string | null
          visibility?: string
          published_kind?: string | null
          canon_status?: string
          canon_stage_id?: string
          canon_note?: string | null
          canon_path?: Json
          publication_snapshot?: Json | null
          created_at?: string
          updated_at?: string
          submitted_at?: string
          reviewed_at?: string | null
          published_at?: string | null
          canonized_at?: string | null
          closed_at?: string | null
        }
        Relationships: []
      }
      lore_submission_links: {
        Row: {
          id: string
          submission_id: string
          role: string
          link_type: string
          original_url: string
          normalized_url: string
          display_title: string | null
          platform: string | null
          author: string | null
          published_at: string | null
          archived_url: string | null
          attribution: string | null
          preservation_note: string | null
          metadata: Json
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          role?: string
          link_type: string
          original_url: string
          normalized_url: string
          display_title?: string | null
          platform?: string | null
          author?: string | null
          published_at?: string | null
          archived_url?: string | null
          attribution?: string | null
          preservation_note?: string | null
          metadata?: Json
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          role?: string
          link_type?: string
          original_url?: string
          normalized_url?: string
          display_title?: string | null
          platform?: string | null
          author?: string | null
          published_at?: string | null
          archived_url?: string | null
          attribution?: string | null
          preservation_note?: string | null
          metadata?: Json
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lore_submission_reviews: {
        Row: {
          id: string
          submission_id: string
          actor_address: string
          action: string
          from_status: string | null
          to_status: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          actor_address: string
          action: string
          from_status?: string | null
          to_status: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          actor_address?: string
          action?: string
          from_status?: string | null
          to_status?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lore_seasons: {
        Row: { id: string; slug: string; title: string; summary: string; sort_order: number; created_at: string; updated_at: string }
        Insert: { id: string; slug: string; title: string; summary: string; sort_order: number; created_at?: string; updated_at?: string }
        Update: { id?: string; slug?: string; title?: string; summary?: string; sort_order?: number; created_at?: string; updated_at?: string }
        Relationships: []
      }
      lore_media: {
        Row: { id: string; kind: string; title: string; url: string | null; archived_url: string | null; alt: string | null; attribution: string; created_at: string; updated_at: string }
        Insert: { id: string; kind: string; title: string; url?: string | null; archived_url?: string | null; alt?: string | null; attribution: string; created_at?: string; updated_at?: string }
        Update: { id?: string; kind?: string; title?: string; url?: string | null; archived_url?: string | null; alt?: string | null; attribution?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      lore_sources: {
        Row: { id: string; kind: string; title: string; url: string | null; archived_url: string | null; author: string | null; platform: string | null; published_at: string | null; captured_at: string | null; attribution: string; preservation_note: string | null; media_ids: string[] | null; created_at: string; updated_at: string }
        Insert: { id: string; kind: string; title: string; url?: string | null; archived_url?: string | null; author?: string | null; platform?: string | null; published_at?: string | null; captured_at?: string | null; attribution: string; preservation_note?: string | null; media_ids?: string[] | null; created_at?: string; updated_at?: string }
        Update: { id?: string; kind?: string; title?: string; url?: string | null; archived_url?: string | null; author?: string | null; platform?: string | null; published_at?: string | null; captured_at?: string | null; attribution?: string; preservation_note?: string | null; media_ids?: string[] | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      lore_locations: {
        Row: { id: string; slug: string; name: string; aliases: string[]; summary: string; description: string | null; image_id: string | null; source_ids: string[] | null; tags: string[]; is_published: boolean; created_at: string; updated_at: string }
        Insert: { id: string; slug: string; name: string; aliases?: string[]; summary: string; description?: string | null; image_id?: string | null; source_ids?: string[] | null; tags?: string[]; is_published?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; slug?: string; name?: string; aliases?: string[]; summary?: string; description?: string | null; image_id?: string | null; source_ids?: string[] | null; tags?: string[]; is_published?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      lore_characters: {
        Row: { id: string; slug: string; name: string; aliases: string[]; summary: string; token_id: number | null; image_url: string | null; external_url: string | null; origin: string | null; character_class: string | null; alignment: string | null; level: number | null; image_id: string | null; first_appearance_event_id: string | null; tags: string[]; is_published: boolean; created_at: string; updated_at: string }
        Insert: { id: string; slug: string; name: string; aliases?: string[]; summary: string; token_id?: number | null; image_url?: string | null; external_url?: string | null; origin?: string | null; character_class?: string | null; alignment?: string | null; level?: number | null; image_id?: string | null; first_appearance_event_id?: string | null; tags?: string[]; is_published?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; slug?: string; name?: string; aliases?: string[]; summary?: string; token_id?: number | null; image_url?: string | null; external_url?: string | null; origin?: string | null; character_class?: string | null; alignment?: string | null; level?: number | null; image_id?: string | null; first_appearance_event_id?: string | null; tags?: string[]; is_published?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      lore_events: {
        Row: { id: string; slug: string; kind: string; title: string; summary: string; body: string; season_id: string | null; location_ids: string[]; character_ids: string[]; entity_refs: Json; occurred_at: string | null; published_at: string | null; timeline_order: number; canon: Json; source_ids: string[]; media_ids: string[] | null; tags: string[]; keywords: string[]; is_published: boolean; created_at: string; updated_at: string }
        Insert: { id: string; slug: string; kind: string; title: string; summary: string; body: string; season_id?: string | null; location_ids?: string[]; character_ids?: string[]; entity_refs?: Json; occurred_at?: string | null; published_at?: string | null; timeline_order: number; canon: Json; source_ids?: string[]; media_ids?: string[] | null; tags?: string[]; keywords?: string[]; is_published?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; slug?: string; kind?: string; title?: string; summary?: string; body?: string; season_id?: string | null; location_ids?: string[]; character_ids?: string[]; entity_refs?: Json; occurred_at?: string | null; published_at?: string | null; timeline_order?: number; canon?: Json; source_ids?: string[]; media_ids?: string[] | null; tags?: string[]; keywords?: string[]; is_published?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_lore_submission_with_links_and_review: {
        Args: {
          p_submitter_address: string
          p_token_id: string
          p_title: string
          p_summary: string
          p_body_markdown: string
          p_tags: string[]
          p_character_ids: string[]
          p_location_ids: string[]
          p_links?: Json
        }
        Returns: string | null
      }
      revise_lore_submission_with_links_and_review: {
        Args: {
          p_submission_id: string
          p_actor_address: string
          p_token_id: string
          p_title: string
          p_summary: string
          p_body_markdown: string
          p_tags: string[]
          p_character_ids: string[]
          p_location_ids: string[]
          p_links?: Json
        }
        Returns: string | null
      }
      create_lore_submission_with_links_review_and_publication: {
        Args: {
          p_submission_id: string | null
          p_submitter_address: string
          p_token_id: string
          p_title: string
          p_summary: string
          p_body_markdown: string
          p_tags: string[]
          p_character_ids: string[]
          p_location_ids: string[]
          p_links?: Json
          p_published_slug?: string | null
          p_published_at?: string
        }
        Returns: string | null
      }
      revise_lore_submission_with_links_review_and_publication: {
        Args: {
          p_submission_id: string
          p_actor_address: string
          p_token_id: string
          p_title: string
          p_summary: string
          p_body_markdown: string
          p_tags: string[]
          p_character_ids: string[]
          p_location_ids: string[]
          p_links?: Json
          p_published_slug?: string | null
          p_published_at?: string
        }
        Returns: string | null
      }
      transition_lore_submission_with_review: {
        Args: {
          p_submission_id: string
          p_expected_statuses: string[]
          p_updates: Json
          p_actor_address: string
          p_action: string
          p_note?: string | null
        }
        Returns: string | null
      }
      update_lore_submission_curation_with_review: {
        Args: {
          p_submission_id: string
          p_updates: Json
          p_actor_address: string
        }
        Returns: string | null
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
