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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          id: number
          ip: unknown
          meta: Json
          occurred_at: string
          target_id: string | null
          target_kind: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          id?: number
          ip?: unknown
          meta?: Json
          occurred_at?: string
          target_id?: string | null
          target_kind?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          id?: number
          ip?: unknown
          meta?: Json
          occurred_at?: string
          target_id?: string | null
          target_kind?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      boost_orders: {
        Row: {
          activated_at: string | null
          amount_cents: number
          created_at: string
          currency: string
          days: number
          id: string
          revolut_order_id: string | null
          seller_id: string
          status: string
          ticket_id: string
        }
        Insert: {
          activated_at?: string | null
          amount_cents: number
          created_at?: string
          currency?: string
          days: number
          id?: string
          revolut_order_id?: string | null
          seller_id: string
          status?: string
          ticket_id: string
        }
        Update: {
          activated_at?: string | null
          amount_cents?: number
          created_at?: string
          currency?: string
          days?: number
          id?: string
          revolut_order_id?: string | null
          seller_id?: string
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boost_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "available_tickets_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boost_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          created_at: string | null
          id: string
          last_message_at: string | null
          seller_id: string
          ticket_id: string
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          seller_id: string
          ticket_id: string
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          seller_id?: string
          ticket_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "available_tickets_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      escp_events: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          ical_last_modified: string | null
          ical_uid: string
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          location: string | null
          organizer: string | null
          start_date: string
          title: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          ical_last_modified?: string | null
          ical_uid: string
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          organizer?: string | null
          start_date: string
          title: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          ical_last_modified?: string | null
          ical_uid?: string
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          location?: string | null
          organizer?: string | null
          start_date?: string
          title?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      event_orders: {
        Row: {
          attendees: Json | null
          buyer_email: string
          buyer_id: string
          cancelled_at: string | null
          created_at: string
          currency: string
          event_id: string
          expires_at: string
          fee_cents: number
          id: string
          organizer_id: string
          paid_at: string | null
          paid_out_at: string | null
          paid_out_transfer_id: string | null
          quantity: number
          refunded_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tier_id: string
          total_cents: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          attendees?: Json | null
          buyer_email: string
          buyer_id: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          event_id: string
          expires_at?: string
          fee_cents?: number
          id?: string
          organizer_id: string
          paid_at?: string | null
          paid_out_at?: string | null
          paid_out_transfer_id?: string | null
          quantity: number
          refunded_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tier_id: string
          total_cents: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          attendees?: Json | null
          buyer_email?: string
          buyer_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          event_id?: string
          expires_at?: string
          fee_cents?: number
          id?: string
          organizer_id?: string
          paid_at?: string | null
          paid_out_at?: string | null
          paid_out_transfer_id?: string | null
          quantity?: number
          refunded_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tier_id?: string
          total_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_earnings"
            referencedColumns: ["organizer_id"]
          },
          {
            foreignKeyName: "event_orders_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_orders_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tier_inventory"
            referencedColumns: ["tier_id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          buyer_id: string
          created_at: string
          event_id: string
          external_code: string | null
          external_file_url: string | null
          external_provider: string | null
          holder_email: string | null
          holder_first_name: string | null
          holder_last_name: string | null
          id: string
          order_id: string
          qr_token: string
          scanned_at: string | null
          scanned_by: string | null
          source: string
          status: Database["public"]["Enums"]["event_ticket_status"]
          tier_id: string
          used_by: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string
          event_id: string
          external_code?: string | null
          external_file_url?: string | null
          external_provider?: string | null
          holder_email?: string | null
          holder_first_name?: string | null
          holder_last_name?: string | null
          id?: string
          order_id: string
          qr_token: string
          scanned_at?: string | null
          scanned_by?: string | null
          source?: string
          status?: Database["public"]["Enums"]["event_ticket_status"]
          tier_id: string
          used_by?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string
          event_id?: string
          external_code?: string | null
          external_file_url?: string | null
          external_provider?: string | null
          holder_email?: string | null
          holder_first_name?: string | null
          holder_last_name?: string | null
          id?: string
          order_id?: string
          qr_token?: string
          scanned_at?: string | null
          scanned_by?: string | null
          source?: string
          status?: Database["public"]["Enums"]["event_ticket_status"]
          tier_id?: string
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "event_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tier_inventory"
            referencedColumns: ["tier_id"]
          },
        ]
      }
      event_tiers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          max_per_order: number
          name: string
          price_cents: number
          reserved_qty: number
          sales_end_at: string | null
          sales_start_at: string | null
          sold_qty: number
          sort_order: number
          source: string
          total_qty: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          max_per_order?: number
          name: string
          price_cents: number
          reserved_qty?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          sold_qty?: number
          sort_order?: number
          source?: string
          total_qty: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          max_per_order?: number
          name?: string
          price_cents?: number
          reserved_qty?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          sold_qty?: number
          sort_order?: number
          source?: string
          total_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          banner_url: string | null
          base_price: number | null
          campus: string | null
          cancelled_at: string | null
          category: string | null
          created_at: string | null
          date: string | null
          description: string | null
          ends_at: string | null
          external_event_id: string | null
          external_id: string | null
          external_source: string | null
          followers_notified_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          location: string | null
          logo_url: string | null
          max_tickets_per_buyer: number | null
          needs_review: boolean
          og_image_url: string | null
          organizer_id: string | null
          primary_color: string | null
          published_at: string | null
          search_vector: unknown
          seo_description: string | null
          slug: string | null
          sold_via_studio: boolean | null
          source: string | null
          starts_at: string | null
          status: string | null
          title: string | null
          university: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          banner_url?: string | null
          base_price?: number | null
          campus?: string | null
          cancelled_at?: string | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          ends_at?: string | null
          external_event_id?: string | null
          external_id?: string | null
          external_source?: string | null
          followers_notified_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          location?: string | null
          logo_url?: string | null
          max_tickets_per_buyer?: number | null
          needs_review?: boolean
          og_image_url?: string | null
          organizer_id?: string | null
          primary_color?: string | null
          published_at?: string | null
          search_vector?: unknown
          seo_description?: string | null
          slug?: string | null
          sold_via_studio?: boolean | null
          source?: string | null
          starts_at?: string | null
          status?: string | null
          title?: string | null
          university?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          banner_url?: string | null
          base_price?: number | null
          campus?: string | null
          cancelled_at?: string | null
          category?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          ends_at?: string | null
          external_event_id?: string | null
          external_id?: string | null
          external_source?: string | null
          followers_notified_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          location?: string | null
          logo_url?: string | null
          max_tickets_per_buyer?: number | null
          needs_review?: boolean
          og_image_url?: string | null
          organizer_id?: string | null
          primary_color?: string | null
          published_at?: string | null
          search_vector?: unknown
          seo_description?: string | null
          slug?: string | null
          sold_via_studio?: boolean | null
          source?: string | null
          starts_at?: string | null
          status?: string | null
          title?: string | null
          university?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_earnings"
            referencedColumns: ["organizer_id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_ticket_inventory: {
        Row: {
          buyer_id: string | null
          created_at: string
          created_by: string | null
          event_id: string
          event_ticket_id: string | null
          external_code: string | null
          external_reference: string | null
          id: string
          notes: string | null
          order_id: string | null
          original_provider: string | null
          platform_price_cents: number | null
          source: string
          status: Database["public"]["Enums"]["external_ticket_status"]
          tier_id: string
          updated_at: string
          uploaded_file_url: string | null
        }
        Insert: {
          buyer_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          event_ticket_id?: string | null
          external_code?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_provider?: string | null
          platform_price_cents?: number | null
          source?: string
          status?: Database["public"]["Enums"]["external_ticket_status"]
          tier_id: string
          updated_at?: string
          uploaded_file_url?: string | null
        }
        Update: {
          buyer_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          event_ticket_id?: string | null
          external_code?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_provider?: string | null
          platform_price_cents?: number | null
          source?: string
          status?: Database["public"]["Enums"]["external_ticket_status"]
          tier_id?: string
          updated_at?: string
          uploaded_file_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_ticket_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ticket_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ticket_inventory_event_ticket_id_fkey"
            columns: ["event_ticket_id"]
            isOneToOne: false
            referencedRelation: "event_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ticket_inventory_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "event_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ticket_inventory_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ticket_inventory_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tier_inventory"
            referencedColumns: ["tier_id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          conversation_id: string
          created_at: string | null
          id: string
          price: number
          proposer_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["offer_status"] | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          id?: string
          price: number
          proposer_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"] | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          id?: string
          price?: number
          proposer_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_follows: {
        Row: {
          created_at: string
          id: string
          organizer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organizer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organizer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_follows_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_earnings"
            referencedColumns: ["organizer_id"]
          },
          {
            foreignKeyName: "organizer_follows_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_payouts: {
        Row: {
          admin_notes: string | null
          amount_cents: number
          batch_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          fee_cents: number | null
          gross_cents: number | null
          iban_holder_used: string
          iban_used: string
          id: string
          organizer_id: string
          processed_at: string | null
          requested_at: string
          revolut_counterparty_id: string | null
          revolut_state: string | null
          revolut_transfer_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          amount_cents: number
          batch_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_cents?: number | null
          gross_cents?: number | null
          iban_holder_used: string
          iban_used: string
          id?: string
          organizer_id: string
          processed_at?: string | null
          requested_at?: string
          revolut_counterparty_id?: string | null
          revolut_state?: string | null
          revolut_transfer_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          amount_cents?: number
          batch_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_cents?: number | null
          gross_cents?: number | null
          iban_holder_used?: string
          iban_used?: string
          id?: string
          organizer_id?: string
          processed_at?: string | null
          requested_at?: string
          revolut_counterparty_id?: string | null
          revolut_state?: string | null
          revolut_transfer_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_payouts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_payouts_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_earnings"
            referencedColumns: ["organizer_id"]
          },
          {
            foreignKeyName: "organizer_payouts_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_profiles: {
        Row: {
          about: string | null
          approved_at: string | null
          approved_by: string | null
          contact_email: string
          contact_name: string
          created_at: string
          expected_attendees: number | null
          first_event_date: string | null
          first_event_name: string | null
          id: string
          logo_url: string | null
          name: string
          org_type: string
          payout_iban: string | null
          payout_iban_holder: string | null
          payout_iban_set_at: string | null
          primary_color: string | null
          rejection_reason: string | null
          slug: string
          status: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          about?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contact_email: string
          contact_name: string
          created_at?: string
          expected_attendees?: number | null
          first_event_date?: string | null
          first_event_name?: string | null
          id?: string
          logo_url?: string | null
          name: string
          org_type: string
          payout_iban?: string | null
          payout_iban_holder?: string | null
          payout_iban_set_at?: string | null
          primary_color?: string | null
          rejection_reason?: string | null
          slug: string
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          about?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contact_email?: string
          contact_name?: string
          created_at?: string
          expected_attendees?: number | null
          first_event_date?: string | null
          first_event_name?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          org_type?: string
          payout_iban?: string | null
          payout_iban_holder?: string | null
          payout_iban_set_at?: string | null
          primary_color?: string | null
          rejection_reason?: string | null
          slug?: string
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      payout_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          num_payouts: number
          provider: string
          sent_at: string | null
          status: string
          total_cents: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id: string
          notes?: string | null
          num_payouts?: number
          provider?: string
          sent_at?: string | null
          status?: string
          total_cents?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          num_payouts?: number
          provider?: string
          sent_at?: string | null
          status?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          campus: string | null
          created_at: string
          deleted_at: string | null
          email: string
          failed_login_attempts: number | null
          full_name: string
          id: string
          locked_until: string | null
          payout_iban: string | null
          payout_iban_holder: string | null
          payout_iban_set_at: string | null
          university: string
          university_email: string
          updated_at: string
        }
        Insert: {
          campus?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          failed_login_attempts?: number | null
          full_name?: string
          id: string
          locked_until?: string | null
          payout_iban?: string | null
          payout_iban_holder?: string | null
          payout_iban_set_at?: string | null
          university?: string
          university_email?: string
          updated_at?: string
        }
        Update: {
          campus?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          failed_login_attempts?: number | null
          full_name?: string
          id?: string
          locked_until?: string | null
          payout_iban?: string | null
          payout_iban_holder?: string | null
          payout_iban_set_at?: string | null
          university?: string
          university_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      seller_payouts: {
        Row: {
          admin_notes: string | null
          amount_cents: number
          batch_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          fee_cents: number | null
          gross_cents: number | null
          iban_holder_used: string
          iban_used: string
          id: string
          processed_at: string | null
          requested_at: string
          revolut_counterparty_id: string | null
          revolut_state: string | null
          revolut_transfer_id: string | null
          seller_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          amount_cents: number
          batch_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_cents?: number | null
          gross_cents?: number | null
          iban_holder_used: string
          iban_used: string
          id?: string
          processed_at?: string | null
          requested_at?: string
          revolut_counterparty_id?: string | null
          revolut_state?: string | null
          revolut_transfer_id?: string | null
          seller_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          amount_cents?: number
          batch_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_cents?: number | null
          gross_cents?: number | null
          iban_holder_used?: string
          iban_used?: string
          id?: string
          processed_at?: string | null
          requested_at?: string
          revolut_counterparty_id?: string | null
          revolut_state?: string | null
          revolut_transfer_id?: string | null
          seller_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payouts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_accounts: {
        Row: {
          charges_enabled: boolean | null
          created_at: string
          details_submitted: boolean | null
          id: string
          onboarding_status: string | null
          payouts_enabled: boolean | null
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean | null
          created_at?: string
          details_submitted?: boolean | null
          id?: string
          onboarding_status?: string | null
          payouts_enabled?: boolean | null
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean | null
          created_at?: string
          details_submitted?: boolean | null
          id?: string
          onboarding_status?: string | null
          payouts_enabled?: boolean | null
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          etag: string | null
          key: string
          last_modified: string | null
          synced_at: string | null
        }
        Insert: {
          etag?: string | null
          key: string
          last_modified?: string | null
          synced_at?: string | null
        }
        Update: {
          etag?: string | null
          key?: string
          last_modified?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      ticket_alerts: {
        Row: {
          created_at: string
          event_id: string
          id: string
          notified_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          notified_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          notified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          boosted_until: string | null
          buyer_id: string | null
          created_at: string | null
          event_id: string | null
          expires_at: string | null
          file_url: string | null
          id: string
          needs_review: boolean
          notes: string | null
          qr_hash: string | null
          qr_verified: boolean
          quantity: number
          seller_id: string | null
          selling_price: number | null
          status: string | null
          studio_ticket_id: string | null
          updated_at: string | null
          verification_errors: Json | null
          verification_status: string
        }
        Insert: {
          boosted_until?: string | null
          buyer_id?: string | null
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          needs_review?: boolean
          notes?: string | null
          qr_hash?: string | null
          qr_verified?: boolean
          quantity?: number
          seller_id?: string | null
          selling_price?: number | null
          status?: string | null
          studio_ticket_id?: string | null
          updated_at?: string | null
          verification_errors?: Json | null
          verification_status?: string
        }
        Update: {
          boosted_until?: string | null
          buyer_id?: string | null
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          needs_review?: boolean
          notes?: string | null
          qr_hash?: string | null
          qr_verified?: boolean
          quantity?: number
          seller_id?: string | null
          selling_price?: number | null
          status?: string | null
          studio_ticket_id?: string | null
          updated_at?: string | null
          verification_errors?: Json | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_studio_ticket_id_fkey"
            columns: ["studio_ticket_id"]
            isOneToOne: false
            referencedRelation: "event_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          fee_amount: number | null
          id: string
          payment_intent_id: string | null
          quantity: number
          seller_id: string
          status: Database["public"]["Enums"]["transaction_status"]
          stripe_checkout_session_id: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          created_at?: string
          fee_amount?: number | null
          id?: string
          payment_intent_id?: string | null
          quantity?: number
          seller_id: string
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_checkout_session_id?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string
          fee_amount?: number | null
          id?: string
          payment_intent_id?: string | null
          quantity?: number
          seller_id?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_checkout_session_id?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "available_tickets_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      available_tickets_public: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string | null
          needs_review: boolean | null
          notes: string | null
          qr_verified: boolean | null
          quantity: number | null
          seller_id: string | null
          selling_price: number | null
          status: string | null
          updated_at: string | null
          verification_errors: Json | null
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          needs_review?: boolean | null
          notes?: string | null
          qr_verified?: boolean | null
          quantity?: number | null
          seller_id?: string | null
          selling_price?: number | null
          status?: string | null
          updated_at?: string | null
          verification_errors?: Json | null
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          needs_review?: boolean | null
          notes?: string | null
          qr_verified?: boolean | null
          quantity?: number | null
          seller_id?: string | null
          selling_price?: number | null
          status?: string | null
          updated_at?: string | null
          verification_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events_with_active_tickets: {
        Row: {
          base_price: number | null
          campus: string | null
          category: string | null
          date: string | null
          external_event_id: string | null
          external_source: string | null
          id: string | null
          image_url: string | null
          location: string | null
          max_price: number | null
          min_price: number | null
          needs_review: boolean | null
          ticket_count: number | null
          title: string | null
          university: string | null
        }
        Relationships: []
      }
      organizer_earnings: {
        Row: {
          available_cents: number | null
          claimed_cents: number | null
          gross_cents: number | null
          net_earned_cents: number | null
          organizer_id: string | null
          paid_orders: number | null
          platform_fee_cents: number | null
        }
        Relationships: []
      }
      seller_earnings: {
        Row: {
          available_cents: number | null
          claimed_cents: number | null
          completed_sales: number | null
          gross_cents: number | null
          net_earned_cents: number | null
          platform_fee_cents: number | null
          seller_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_inventory: {
        Row: {
          available_qty: number | null
          currency: string | null
          description: string | null
          event_id: string | null
          is_active: boolean | null
          name: string | null
          price_cents: number | null
          reserved_qty: number | null
          sold_qty: number | null
          sort_order: number | null
          tier_id: string | null
          total_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_active_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      audit_record: {
        Args: {
          p_action: string
          p_actor_email?: string
          p_actor_id?: string
          p_ip?: unknown
          p_meta?: Json
          p_target_id?: string
          p_target_kind?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      buyer_ticket_count_for_event: {
        Args: { p_buyer_id: string; p_event_id: string }
        Returns: number
      }
      check_account_lockout: { Args: { user_email: string }; Returns: boolean }
      cleanup_stuck_orders: {
        Args: never
        Returns: {
          expired_orders: number
          released_tickets: number
          released_tiers: number
        }[]
      }
      create_stub_event: {
        Args: { p_starts_at: string; p_title: string }
        Returns: string
      }
      external_cancel_rows: { Args: { p_row_ids: string[] }; Returns: number }
      finalize_tier_sale: {
        Args: { p_qty: number; p_tier_id: string }
        Returns: undefined
      }
      increment_failed_login: {
        Args: { user_email: string }
        Returns: undefined
      }
      organizer_payments_ready: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      rate_limit_consume: {
        Args: {
          p_bucket: string
          p_key: string
          p_max_hits: number
          p_window_sec: number
        }
        Returns: boolean
      }
      release_tier_reservation: {
        Args: { p_qty: number; p_tier_id: string }
        Returns: undefined
      }
      reserve_tier: {
        Args: { p_qty: number; p_tier_id: string }
        Returns: boolean
      }
      reset_failed_login: { Args: { user_email: string }; Returns: undefined }
      search_events: {
        Args: { max_results?: number; query: string }
        Returns: {
          banner_url: string | null
          base_price: number | null
          campus: string | null
          cancelled_at: string | null
          category: string | null
          created_at: string | null
          date: string | null
          description: string | null
          ends_at: string | null
          external_event_id: string | null
          external_id: string | null
          external_source: string | null
          followers_notified_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          location: string | null
          logo_url: string | null
          max_tickets_per_buyer: number | null
          needs_review: boolean
          og_image_url: string | null
          organizer_id: string | null
          primary_color: string | null
          published_at: string | null
          search_vector: unknown
          seo_description: string | null
          slug: string | null
          sold_via_studio: boolean | null
          source: string | null
          starts_at: string | null
          status: string | null
          title: string | null
          university: string | null
          updated_at: string | null
          url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seller_public_stats: {
        Args: { p_seller_id: string }
        Returns: {
          campus: string
          completed_sales: number
          full_name: string
          member_since: string
          university: string
        }[]
      }
      sync_external_tier_capacity: {
        Args: { p_tier_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      event_ticket_status:
        | "valid"
        | "scanned"
        | "cancelled"
        | "refunded"
        | "transferred"
      external_ticket_status:
        | "draft"
        | "available"
        | "sold"
        | "cancelled"
        | "used"
      offer_status: "pending" | "accepted" | "rejected" | "expired"
      ticket_status: "available" | "reserved" | "sold" | "cancelled"
      transaction_status:
        | "pending"
        | "completed"
        | "cancelled"
        | "refunded"
        | "escrowed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      event_ticket_status: [
        "valid",
        "scanned",
        "cancelled",
        "refunded",
        "transferred",
      ],
      external_ticket_status: [
        "draft",
        "available",
        "sold",
        "cancelled",
        "used",
      ],
      offer_status: ["pending", "accepted", "rejected", "expired"],
      ticket_status: ["available", "reserved", "sold", "cancelled"],
      transaction_status: [
        "pending",
        "completed",
        "cancelled",
        "refunded",
        "escrowed",
      ],
    },
  },
} as const
