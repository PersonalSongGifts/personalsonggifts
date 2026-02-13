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
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          automation_audio_url_source: string | null
          automation_last_error: string | null
          automation_lyrics: string | null
          automation_manual_override_at: string | null
          automation_raw_callback: Json | null
          automation_retry_count: number | null
          automation_started_at: string | null
          automation_status: string | null
          automation_style_id: string | null
          automation_task_id: string | null
          captured_at: string
          converted_at: string | null
          cover_image_url: string | null
          customer_name: string
          dismissed_at: string | null
          earliest_generate_at: string | null
          email: string
          favorite_memory: string
          follow_up_sent_at: string | null
          full_song_url: string | null
          generated_at: string | null
          genre: string
          id: string
          inputs_hash: string | null
          last_valentine_remarketing_sent_at: string | null
          lead_email_cc: string | null
          lead_email_override: string | null
          lyrics_language_code: string
          lyrics_language_qa: Json | null
          lyrics_raw_attempt_1: string | null
          lyrics_raw_attempt_2: string | null
          next_attempt_at: string | null
          occasion: string
          order_id: string | null
          phone: string | null
          phone_e164: string | null
          preview_opened_at: string | null
          preview_play_count: number | null
          preview_played_at: string | null
          preview_scheduled_at: string | null
          preview_sent_at: string | null
          preview_sent_to_emails: Json | null
          preview_song_url: string | null
          preview_token: string | null
          quality_score: number | null
          recipient_name: string
          recipient_name_pronunciation: string | null
          recipient_type: string
          sent_at: string | null
          singer_preference: string
          sms_last_error: string | null
          sms_opt_in: boolean
          sms_scheduled_for: string | null
          sms_sent_at: string | null
          sms_status: string | null
          song_title: string | null
          special_message: string | null
          special_qualities: string
          status: string
          target_send_at: string | null
          timezone: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          automation_audio_url_source?: string | null
          automation_last_error?: string | null
          automation_lyrics?: string | null
          automation_manual_override_at?: string | null
          automation_raw_callback?: Json | null
          automation_retry_count?: number | null
          automation_started_at?: string | null
          automation_status?: string | null
          automation_style_id?: string | null
          automation_task_id?: string | null
          captured_at?: string
          converted_at?: string | null
          cover_image_url?: string | null
          customer_name: string
          dismissed_at?: string | null
          earliest_generate_at?: string | null
          email: string
          favorite_memory: string
          follow_up_sent_at?: string | null
          full_song_url?: string | null
          generated_at?: string | null
          genre: string
          id?: string
          inputs_hash?: string | null
          last_valentine_remarketing_sent_at?: string | null
          lead_email_cc?: string | null
          lead_email_override?: string | null
          lyrics_language_code?: string
          lyrics_language_qa?: Json | null
          lyrics_raw_attempt_1?: string | null
          lyrics_raw_attempt_2?: string | null
          next_attempt_at?: string | null
          occasion: string
          order_id?: string | null
          phone?: string | null
          phone_e164?: string | null
          preview_opened_at?: string | null
          preview_play_count?: number | null
          preview_played_at?: string | null
          preview_scheduled_at?: string | null
          preview_sent_at?: string | null
          preview_sent_to_emails?: Json | null
          preview_song_url?: string | null
          preview_token?: string | null
          quality_score?: number | null
          recipient_name: string
          recipient_name_pronunciation?: string | null
          recipient_type: string
          sent_at?: string | null
          singer_preference: string
          sms_last_error?: string | null
          sms_opt_in?: boolean
          sms_scheduled_for?: string | null
          sms_sent_at?: string | null
          sms_status?: string | null
          song_title?: string | null
          special_message?: string | null
          special_qualities: string
          status?: string
          target_send_at?: string | null
          timezone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          automation_audio_url_source?: string | null
          automation_last_error?: string | null
          automation_lyrics?: string | null
          automation_manual_override_at?: string | null
          automation_raw_callback?: Json | null
          automation_retry_count?: number | null
          automation_started_at?: string | null
          automation_status?: string | null
          automation_style_id?: string | null
          automation_task_id?: string | null
          captured_at?: string
          converted_at?: string | null
          cover_image_url?: string | null
          customer_name?: string
          dismissed_at?: string | null
          earliest_generate_at?: string | null
          email?: string
          favorite_memory?: string
          follow_up_sent_at?: string | null
          full_song_url?: string | null
          generated_at?: string | null
          genre?: string
          id?: string
          inputs_hash?: string | null
          last_valentine_remarketing_sent_at?: string | null
          lead_email_cc?: string | null
          lead_email_override?: string | null
          lyrics_language_code?: string
          lyrics_language_qa?: Json | null
          lyrics_raw_attempt_1?: string | null
          lyrics_raw_attempt_2?: string | null
          next_attempt_at?: string | null
          occasion?: string
          order_id?: string | null
          phone?: string | null
          phone_e164?: string | null
          preview_opened_at?: string | null
          preview_play_count?: number | null
          preview_played_at?: string | null
          preview_scheduled_at?: string | null
          preview_sent_at?: string | null
          preview_sent_to_emails?: Json | null
          preview_song_url?: string | null
          preview_token?: string | null
          quality_score?: number | null
          recipient_name?: string
          recipient_name_pronunciation?: string | null
          recipient_type?: string
          sent_at?: string | null
          singer_preference?: string
          sms_last_error?: string | null
          sms_opt_in?: boolean
          sms_scheduled_for?: string | null
          sms_sent_at?: string | null
          sms_status?: string | null
          song_title?: string | null
          special_message?: string | null
          special_qualities?: string
          status?: string
          target_send_at?: string | null
          timezone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_automation_style_id_fkey"
            columns: ["automation_style_id"]
            isOneToOne: false
            referencedRelation: "song_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_activity_log: {
        Row: {
          actor: string
          created_at: string
          details: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          actor?: string
          created_at?: string
          details?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          actor?: string
          created_at?: string
          details?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          automation_audio_url_source: string | null
          automation_last_error: string | null
          automation_lyrics: string | null
          automation_manual_override_at: string | null
          automation_raw_callback: Json | null
          automation_retry_count: number | null
          automation_started_at: string | null
          automation_status: string | null
          automation_style_id: string | null
          automation_task_id: string | null
          cover_image_url: string | null
          created_at: string
          customer_email: string
          customer_email_cc: string | null
          customer_email_override: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          delivery_last_error: string | null
          delivery_retry_count: number | null
          delivery_status: string | null
          device_type: string | null
          dismissed_at: string | null
          earliest_generate_at: string | null
          expected_delivery: string | null
          favorite_memory: string
          generated_at: string | null
          genre: string
          id: string
          inputs_hash: string | null
          lyrics_language_code: string
          lyrics_language_qa: Json | null
          lyrics_price_cents: number | null
          lyrics_raw_attempt_1: string | null
          lyrics_raw_attempt_2: string | null
          lyrics_unlock_payment_intent_id: string | null
          lyrics_unlock_session_id: string | null
          lyrics_unlocked_at: string | null
          next_attempt_at: string | null
          notes: string | null
          occasion: string
          phone_e164: string | null
          price: number
          price_cents: number | null
          pricing_tier: string
          reaction_submitted_at: string | null
          reaction_video_url: string | null
          recipient_name: string
          recipient_name_pronunciation: string | null
          recipient_type: string
          resend_scheduled_at: string | null
          scheduled_delivery_at: string | null
          sent_at: string | null
          sent_to_emails: Json | null
          singer_preference: string
          sms_last_error: string | null
          sms_opt_in: boolean
          sms_scheduled_for: string | null
          sms_sent_at: string | null
          sms_status: string | null
          song_download_count: number | null
          song_downloaded_at: string | null
          song_play_count: number | null
          song_played_at: string | null
          song_title: string | null
          song_url: string | null
          source: string | null
          special_message: string | null
          special_qualities: string
          status: string
          target_send_at: string | null
          timezone: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          automation_audio_url_source?: string | null
          automation_last_error?: string | null
          automation_lyrics?: string | null
          automation_manual_override_at?: string | null
          automation_raw_callback?: Json | null
          automation_retry_count?: number | null
          automation_started_at?: string | null
          automation_status?: string | null
          automation_style_id?: string | null
          automation_task_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          customer_email: string
          customer_email_cc?: string | null
          customer_email_override?: string | null
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_last_error?: string | null
          delivery_retry_count?: number | null
          delivery_status?: string | null
          device_type?: string | null
          dismissed_at?: string | null
          earliest_generate_at?: string | null
          expected_delivery?: string | null
          favorite_memory: string
          generated_at?: string | null
          genre: string
          id?: string
          inputs_hash?: string | null
          lyrics_language_code?: string
          lyrics_language_qa?: Json | null
          lyrics_price_cents?: number | null
          lyrics_raw_attempt_1?: string | null
          lyrics_raw_attempt_2?: string | null
          lyrics_unlock_payment_intent_id?: string | null
          lyrics_unlock_session_id?: string | null
          lyrics_unlocked_at?: string | null
          next_attempt_at?: string | null
          notes?: string | null
          occasion: string
          phone_e164?: string | null
          price: number
          price_cents?: number | null
          pricing_tier: string
          reaction_submitted_at?: string | null
          reaction_video_url?: string | null
          recipient_name: string
          recipient_name_pronunciation?: string | null
          recipient_type: string
          resend_scheduled_at?: string | null
          scheduled_delivery_at?: string | null
          sent_at?: string | null
          sent_to_emails?: Json | null
          singer_preference: string
          sms_last_error?: string | null
          sms_opt_in?: boolean
          sms_scheduled_for?: string | null
          sms_sent_at?: string | null
          sms_status?: string | null
          song_download_count?: number | null
          song_downloaded_at?: string | null
          song_play_count?: number | null
          song_played_at?: string | null
          song_title?: string | null
          song_url?: string | null
          source?: string | null
          special_message?: string | null
          special_qualities: string
          status?: string
          target_send_at?: string | null
          timezone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          automation_audio_url_source?: string | null
          automation_last_error?: string | null
          automation_lyrics?: string | null
          automation_manual_override_at?: string | null
          automation_raw_callback?: Json | null
          automation_retry_count?: number | null
          automation_started_at?: string | null
          automation_status?: string | null
          automation_style_id?: string | null
          automation_task_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          customer_email?: string
          customer_email_cc?: string | null
          customer_email_override?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_last_error?: string | null
          delivery_retry_count?: number | null
          delivery_status?: string | null
          device_type?: string | null
          dismissed_at?: string | null
          earliest_generate_at?: string | null
          expected_delivery?: string | null
          favorite_memory?: string
          generated_at?: string | null
          genre?: string
          id?: string
          inputs_hash?: string | null
          lyrics_language_code?: string
          lyrics_language_qa?: Json | null
          lyrics_price_cents?: number | null
          lyrics_raw_attempt_1?: string | null
          lyrics_raw_attempt_2?: string | null
          lyrics_unlock_payment_intent_id?: string | null
          lyrics_unlock_session_id?: string | null
          lyrics_unlocked_at?: string | null
          next_attempt_at?: string | null
          notes?: string | null
          occasion?: string
          phone_e164?: string | null
          price?: number
          price_cents?: number | null
          pricing_tier?: string
          reaction_submitted_at?: string | null
          reaction_video_url?: string | null
          recipient_name?: string
          recipient_name_pronunciation?: string | null
          recipient_type?: string
          resend_scheduled_at?: string | null
          scheduled_delivery_at?: string | null
          sent_at?: string | null
          sent_to_emails?: Json | null
          singer_preference?: string
          sms_last_error?: string | null
          sms_opt_in?: boolean
          sms_scheduled_for?: string | null
          sms_sent_at?: string | null
          sms_status?: string | null
          song_download_count?: number | null
          song_downloaded_at?: string | null
          song_play_count?: number | null
          song_played_at?: string | null
          song_title?: string | null
          song_url?: string | null
          source?: string | null
          special_message?: string | null
          special_qualities?: string
          status?: string
          target_send_at?: string | null
          timezone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_automation_style_id_fkey"
            columns: ["automation_style_id"]
            isOneToOne: false
            referencedRelation: "song_styles"
            referencedColumns: ["id"]
          },
        ]
      }
      playback_errors: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          error_name: string
          id: string
          is_online: boolean | null
          song_url_host: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          error_name: string
          id?: string
          is_online?: boolean | null
          song_url_host?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          error_name?: string
          id?: string
          is_online?: boolean | null
          song_url_host?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      song_styles: {
        Row: {
          created_at: string
          genre_match: string
          id: string
          is_active: boolean
          label: string
          suno_prompt: string
          usage_count: number
          vocal_gender: string
        }
        Insert: {
          created_at?: string
          genre_match: string
          id?: string
          is_active?: boolean
          label: string
          suno_prompt: string
          usage_count?: number
          vocal_gender: string
        }
        Update: {
          created_at?: string
          genre_match?: string
          id?: string
          is_active?: boolean
          label?: string
          suno_prompt?: string
          usage_count?: number
          vocal_gender?: string
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
      find_orders_by_short_id: {
        Args: {
          max_results?: number
          require_song_url?: boolean
          select_fields?: string
          short_id: string
          status_filter?: string[]
        }
        Returns: {
          automation_audio_url_source: string | null
          automation_last_error: string | null
          automation_lyrics: string | null
          automation_manual_override_at: string | null
          automation_raw_callback: Json | null
          automation_retry_count: number | null
          automation_started_at: string | null
          automation_status: string | null
          automation_style_id: string | null
          automation_task_id: string | null
          cover_image_url: string | null
          created_at: string
          customer_email: string
          customer_email_cc: string | null
          customer_email_override: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          delivery_last_error: string | null
          delivery_retry_count: number | null
          delivery_status: string | null
          device_type: string | null
          dismissed_at: string | null
          earliest_generate_at: string | null
          expected_delivery: string | null
          favorite_memory: string
          generated_at: string | null
          genre: string
          id: string
          inputs_hash: string | null
          lyrics_language_code: string
          lyrics_language_qa: Json | null
          lyrics_price_cents: number | null
          lyrics_raw_attempt_1: string | null
          lyrics_raw_attempt_2: string | null
          lyrics_unlock_payment_intent_id: string | null
          lyrics_unlock_session_id: string | null
          lyrics_unlocked_at: string | null
          next_attempt_at: string | null
          notes: string | null
          occasion: string
          phone_e164: string | null
          price: number
          price_cents: number | null
          pricing_tier: string
          reaction_submitted_at: string | null
          reaction_video_url: string | null
          recipient_name: string
          recipient_name_pronunciation: string | null
          recipient_type: string
          resend_scheduled_at: string | null
          scheduled_delivery_at: string | null
          sent_at: string | null
          sent_to_emails: Json | null
          singer_preference: string
          sms_last_error: string | null
          sms_opt_in: boolean
          sms_scheduled_for: string | null
          sms_sent_at: string | null
          sms_status: string | null
          song_download_count: number | null
          song_downloaded_at: string | null
          song_play_count: number | null
          song_played_at: string | null
          song_title: string | null
          song_url: string | null
          source: string | null
          special_message: string | null
          special_qualities: string
          status: string
          target_send_at: string | null
          timezone: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
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
