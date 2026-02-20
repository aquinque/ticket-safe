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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      access_audit_log: {
        Row: {
          access_granted: boolean
          created_at: string
          function_name: string
          id: string
          ip_address: unknown
          resource_id: string | null
          user_id: string | null
        }
        Insert: {
          access_granted: boolean
          created_at?: string
          function_name: string
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          user_id?: string | null
        }
        Update: {
          access_granted?: boolean
          created_at?: string
          function_name?: string
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          request_type: string
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          request_type: string
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          request_type?: string
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          base_price: number | null
          campus: string | null
          category: string
          created_at: string
          date: string
          description: string | null
          external_event_id: string | null
          external_source: string | null
          id: string
          image_url: string | null
          is_active: boolean
          location: string
          needs_review: boolean
          title: string
          university: string
          updated_at: string
        }
        Insert: {
          base_price?: number | null
          campus?: string | null
          category: string
          created_at?: string
          date: string
          description?: string | null
          external_event_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          location: string
          needs_review?: boolean
          title: string
          university: string
          updated_at?: string
        }
        Update: {
          base_price?: number | null
          campus?: string | null
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          external_event_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          location?: string
          needs_review?: boolean
          title?: string
          university?: string
          updated_at?: string
        }
        Relationships: []
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
          full_name: string
          id: string
          locked_until?: string | null
          university: string
          university_email: string
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
          university?: string
          university_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          id: string
          notes: string | null
          original_price: number
          quantity: number
          qr_hash: string | null
          qr_verified: boolean
          seller_id: string
          selling_price: number
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_file_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          original_price: number
          quantity?: number
          qr_hash?: string | null
          qr_verified?: boolean
          seller_id: string
          selling_price: number
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_file_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          original_price?: number
          quantity?: number
          qr_hash?: string | null
          qr_verified?: boolean
          seller_id?: string
          selling_price?: number
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_file_url?: string | null
          updated_at?: string
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
            foreignKeyName: "tickets_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          escrow_released_at: string | null
          id: string
          payment_intent_id: string | null
          quantity: number
          seller_id: string
          status: Database["public"]["Enums"]["transaction_status"]
          ticket_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          created_at?: string
          escrow_released_at?: string | null
          id?: string
          payment_intent_id?: string | null
          quantity?: number
          seller_id: string
          status?: Database["public"]["Enums"]["transaction_status"]
          ticket_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string
          escrow_released_at?: string | null
          id?: string
          payment_intent_id?: string | null
          quantity?: number
          seller_id?: string
          status?: Database["public"]["Enums"]["transaction_status"]
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
      user_consents: {
        Row: {
          consent_text: string
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          expires_at: string | null
          granted_at: string
          id: string
          ip_address: unknown
          status: Database["public"]["Enums"]["consent_status"]
          updated_at: string
          user_agent: string | null
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          consent_text: string
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          ip_address?: unknown
          status?: Database["public"]["Enums"]["consent_status"]
          updated_at?: string
          user_agent?: string | null
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          consent_text?: string
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          ip_address?: unknown
          status?: Database["public"]["Enums"]["consent_status"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: []
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
      verified_university_domains: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: string
          university_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: string
          university_name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: string
          university_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      available_tickets_public: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string | null
          notes: string | null
          original_price: number | null
          quantity: number | null
          qr_verified: boolean | null
          seller_id: string | null
          selling_price: number | null
          status: Database["public"]["Enums"]["ticket_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          notes?: string | null
          original_price?: number | null
          quantity?: number | null
          qr_verified?: boolean | null
          seller_id?: string | null
          selling_price?: number | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          notes?: string | null
          original_price?: number | null
          quantity?: number | null
          qr_verified?: boolean | null
          seller_id?: string | null
          selling_price?: number | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          updated_at?: string | null
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
            foreignKeyName: "tickets_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      anonymize_user: { Args: { user_id: string }; Returns: undefined }
      check_account_lockout: { Args: { user_email: string }; Returns: boolean }
      get_anonymized_transaction_stats: {
        Args: { end_date: string; start_date: string }
        Returns: {
          avg_amount: number
          campus: string
          date_bucket: string
          transaction_count: number
          university: string
        }[]
      }
      get_purchased_ticket_file: {
        Args: { ticket_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_failed_login: { Args: { user_email: string }; Returns: number }
      reset_failed_login: { Args: { user_email: string }; Returns: undefined }
      validate_university_email: {
        Args: { email_address: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      consent_status: "granted" | "withdrawn" | "expired"
      consent_type:
        | "data_monetization"
        | "aggregated_analytics"
        | "research_participation"
      ticket_status: "available" | "sold" | "reserved"
      transaction_status:
        | "pending"
        | "escrowed"
        | "completed"
        | "cancelled"
        | "refunded"
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
      consent_status: ["granted", "withdrawn", "expired"],
      consent_type: [
        "data_monetization",
        "aggregated_analytics",
        "research_participation",
      ],
      ticket_status: ["available", "sold", "reserved"],
      transaction_status: [
        "pending",
        "escrowed",
        "completed",
        "cancelled",
        "refunded",
      ],
    },
  },
} as const
