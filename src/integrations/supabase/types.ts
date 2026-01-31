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
      leads: {
        Row: {
          captured_at: string
          converted_at: string | null
          cover_image_url: string | null
          customer_name: string
          email: string
          favorite_memory: string
          follow_up_sent_at: string | null
          full_song_url: string | null
          genre: string
          id: string
          occasion: string
          order_id: string | null
          phone: string | null
          preview_opened_at: string | null
          preview_sent_at: string | null
          preview_song_url: string | null
          preview_token: string | null
          quality_score: number | null
          recipient_name: string
          recipient_type: string
          singer_preference: string
          song_title: string | null
          special_message: string | null
          special_qualities: string
          status: string
        }
        Insert: {
          captured_at?: string
          converted_at?: string | null
          cover_image_url?: string | null
          customer_name: string
          email: string
          favorite_memory: string
          follow_up_sent_at?: string | null
          full_song_url?: string | null
          genre: string
          id?: string
          occasion: string
          order_id?: string | null
          phone?: string | null
          preview_opened_at?: string | null
          preview_sent_at?: string | null
          preview_song_url?: string | null
          preview_token?: string | null
          quality_score?: number | null
          recipient_name: string
          recipient_type: string
          singer_preference: string
          song_title?: string | null
          special_message?: string | null
          special_qualities: string
          status?: string
        }
        Update: {
          captured_at?: string
          converted_at?: string | null
          cover_image_url?: string | null
          customer_name?: string
          email?: string
          favorite_memory?: string
          follow_up_sent_at?: string | null
          full_song_url?: string | null
          genre?: string
          id?: string
          occasion?: string
          order_id?: string | null
          phone?: string | null
          preview_opened_at?: string | null
          preview_sent_at?: string | null
          preview_song_url?: string | null
          preview_token?: string | null
          quality_score?: number | null
          recipient_name?: string
          recipient_type?: string
          singer_preference?: string
          song_title?: string | null
          special_message?: string | null
          special_qualities?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cover_image_url: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          device_type: string | null
          expected_delivery: string | null
          favorite_memory: string
          genre: string
          id: string
          notes: string | null
          occasion: string
          price: number
          pricing_tier: string
          reaction_submitted_at: string | null
          reaction_video_url: string | null
          recipient_name: string
          recipient_type: string
          scheduled_delivery_at: string | null
          singer_preference: string
          song_title: string | null
          song_url: string | null
          special_message: string | null
          special_qualities: string
          status: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          device_type?: string | null
          expected_delivery?: string | null
          favorite_memory: string
          genre: string
          id?: string
          notes?: string | null
          occasion: string
          price: number
          pricing_tier: string
          reaction_submitted_at?: string | null
          reaction_video_url?: string | null
          recipient_name: string
          recipient_type: string
          scheduled_delivery_at?: string | null
          singer_preference: string
          song_title?: string | null
          song_url?: string | null
          special_message?: string | null
          special_qualities: string
          status?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          device_type?: string | null
          expected_delivery?: string | null
          favorite_memory?: string
          genre?: string
          id?: string
          notes?: string | null
          occasion?: string
          price?: number
          pricing_tier?: string
          reaction_submitted_at?: string | null
          reaction_video_url?: string | null
          recipient_name?: string
          recipient_type?: string
          scheduled_delivery_at?: string | null
          singer_preference?: string
          song_title?: string | null
          song_url?: string | null
          special_message?: string | null
          special_qualities?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_lead_quality_score: {
        Args: {
          p_email: string
          p_favorite_memory: string
          p_phone?: string
          p_special_qualities: string
        }
        Returns: number
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
    Enums: {},
  },
} as const
