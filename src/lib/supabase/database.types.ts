export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          admin_id: string | null;
          clinic_id: string | null;
          created_at: string;
          details: string;
          id: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          admin_id?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          details?: string;
          id?: never;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          details?: string;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_audit_log_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_questions: {
        Row: {
          clinic_id: string;
          id: string;
          question: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          id?: string;
          question: string;
          sort_order?: number;
        };
        Update: {
          clinic_id?: string;
          id?: string;
          question?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_questions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          clinic_id: string;
          contact_phone: string;
          created_at: string;
          ends_at: string;
          external_ref: string | null;
          id: number;
          patient_name: string;
          procedure_name: string;
          professional_name: string;
          reminder_sent_at: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          contact_phone: string;
          created_at?: string;
          ends_at: string;
          external_ref?: string | null;
          id?: never;
          patient_name?: string;
          procedure_name?: string;
          professional_name?: string;
          reminder_sent_at?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
        };
        Update: {
          clinic_id?: string;
          contact_phone?: string;
          created_at?: string;
          ends_at?: string;
          external_ref?: string | null;
          id?: never;
          patient_name?: string;
          procedure_name?: string;
          professional_name?: string;
          reminder_sent_at?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_members: {
        Row: {
          clinic_id: string;
          created_at: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          created_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_secrets: {
        Row: {
          agenda_api_key_secret_id: string | null;
          clinic_id: string;
          updated_at: string;
          whatsapp_token_secret_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agenda_api_key_secret_id?: string | null;
          clinic_id: string;
          updated_at?: string;
          whatsapp_token_secret_id?: string | null;
        };
        Update: {
          agenda_api_key_secret_id?: string | null;
          clinic_id?: string;
          updated_at?: string;
          whatsapp_token_secret_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_secrets_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinics: {
        Row: {
          assistant_name: string;
          behavior_rules: string;
          business_info: string;
          conversation_timeout_hours: number | null;
          created_at: string;
          extra_closed_dates: string;
          id: string;
          is_active: boolean;
          name: string;
          past_conversations: string;
          reminder_template_name: string | null;
          staff_alert_template_name: string | null;
          staff_phone_number: string | null;
          template_language: string;
          tone: string;
          updated_at: string;
          whatsapp_phone_number_id: string | null;
          work_days: number[];
          work_hours_end: string | null;
          work_hours_start: string | null;
          works_on_holidays: boolean;
        };
        ComputedFields: never;
        Insert: {
          assistant_name?: string;
          behavior_rules?: string;
          business_info?: string;
          conversation_timeout_hours?: number | null;
          created_at?: string;
          extra_closed_dates?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          past_conversations?: string;
          reminder_template_name?: string | null;
          staff_alert_template_name?: string | null;
          staff_phone_number?: string | null;
          template_language?: string;
          tone?: string;
          updated_at?: string;
          whatsapp_phone_number_id?: string | null;
          work_days?: number[];
          work_hours_end?: string | null;
          work_hours_start?: string | null;
          works_on_holidays?: boolean;
        };
        Update: {
          assistant_name?: string;
          behavior_rules?: string;
          business_info?: string;
          conversation_timeout_hours?: number | null;
          created_at?: string;
          extra_closed_dates?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          past_conversations?: string;
          reminder_template_name?: string | null;
          staff_alert_template_name?: string | null;
          staff_phone_number?: string | null;
          template_language?: string;
          tone?: string;
          updated_at?: string;
          whatsapp_phone_number_id?: string | null;
          work_days?: number[];
          work_hours_end?: string | null;
          work_hours_start?: string | null;
          works_on_holidays?: boolean;
        };
        Relationships: [];
      };
      contact_reasons: {
        Row: {
          clinic_id: string;
          description: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          description?: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          clinic_id?: string;
          description?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contact_reasons_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          attendance_state: Database["public"]["Enums"]["attendance_state"];
          clinic_id: string;
          closed_at: string | null;
          contact_phone: string;
          contact_reason_id: string | null;
          id: number;
          last_message_at: string;
          needs_human_at: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["conversation_status"];
          summary: string | null;
        };
        ComputedFields: never;
        Insert: {
          attendance_state?: Database["public"]["Enums"]["attendance_state"];
          clinic_id: string;
          closed_at?: string | null;
          contact_phone: string;
          contact_reason_id?: string | null;
          id?: never;
          last_message_at?: string;
          needs_human_at?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          summary?: string | null;
        };
        Update: {
          attendance_state?: Database["public"]["Enums"]["attendance_state"];
          clinic_id?: string;
          closed_at?: string | null;
          contact_phone?: string;
          contact_reason_id?: string | null;
          id?: never;
          last_message_at?: string;
          needs_human_at?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_contact_reason_id_fkey";
            columns: ["contact_reason_id"];
            isOneToOne: false;
            referencedRelation: "contact_reasons";
            referencedColumns: ["id"];
          },
        ];
      };
      faqs: {
        Row: {
          answer: string;
          clinic_id: string;
          id: string;
          question: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          answer: string;
          clinic_id: string;
          id?: string;
          question: string;
          sort_order?: number;
        };
        Update: {
          answer?: string;
          clinic_id?: string;
          id?: string;
          question?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "faqs_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      images: {
        Row: {
          clinic_id: string;
          created_at: string;
          description: string;
          id: string;
          original_name: string;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          created_at?: string;
          description: string;
          id?: string;
          original_name?: string;
          storage_path: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          original_name?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "images_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      integrations: {
        Row: {
          actions_config: Json | null;
          clinic_id: string;
          enabled: boolean;
          mode: Database["public"]["Enums"]["integration_mode"];
          provider_name: string;
          reminder_hours_before: number;
          updated_at: string;
          webhook_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          actions_config?: Json | null;
          clinic_id: string;
          enabled?: boolean;
          mode?: Database["public"]["Enums"]["integration_mode"];
          provider_name?: string;
          reminder_hours_before?: number;
          updated_at?: string;
          webhook_url?: string | null;
        };
        Update: {
          actions_config?: Json | null;
          clinic_id?: string;
          enabled?: boolean;
          mode?: Database["public"]["Enums"]["integration_mode"];
          provider_name?: string;
          reminder_hours_before?: number;
          updated_at?: string;
          webhook_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integrations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          clinic_id: string;
          contact_phone: string;
          content: string;
          conversation_id: number;
          created_at: string;
          id: number;
          role: Database["public"]["Enums"]["message_role"];
          sent_by: string | null;
          sent_image_id: string | null;
          wa_message_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          contact_phone: string;
          content: string;
          conversation_id: number;
          created_at?: string;
          id?: never;
          role: Database["public"]["Enums"]["message_role"];
          sent_by?: string | null;
          sent_image_id?: string | null;
          wa_message_id?: string | null;
        };
        Update: {
          clinic_id?: string;
          contact_phone?: string;
          content?: string;
          conversation_id?: number;
          created_at?: string;
          id?: never;
          role?: Database["public"]["Enums"]["message_role"];
          sent_by?: string | null;
          sent_image_id?: string | null;
          wa_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sent_image_id_fkey";
            columns: ["sent_image_id"];
            isOneToOne: false;
            referencedRelation: "images";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          created_at: string;
          id: string;
          provider_payment_id: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          subscription_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          created_at?: string;
          id?: string;
          provider_payment_id?: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          subscription_id: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          id?: string;
          provider_payment_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          active: boolean;
          code: string;
          description: string;
          features: NonNullable<Json>;
          highlight: boolean;
          id: number;
          message_quota: number;
          name: string;
          price_cents: number;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          description?: string;
          features?: NonNullable<Json>;
          highlight?: boolean;
          id?: never;
          message_quota: number;
          name: string;
          price_cents: number;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          description?: string;
          features?: NonNullable<Json>;
          highlight?: boolean;
          id?: never;
          message_quota?: number;
          name?: string;
          price_cents?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      professionals: {
        Row: {
          clinic_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          clinic_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_admin: boolean;
          last_login_ip: string | null;
          phone: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          is_admin?: boolean;
          last_login_ip?: string | null;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_admin?: boolean;
          last_login_ip?: string | null;
          phone?: string | null;
        };
        Relationships: [];
      };
      services: {
        Row: {
          clinic_id: string;
          duration_minutes: number;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          duration_minutes?: number;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          clinic_id?: string;
          duration_minutes?: number;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          clinic_id: string;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          grace_until: string | null;
          id: string;
          messages_used_this_period: number;
          mp_preapproval_id: string | null;
          plan_id: number;
          quota_alert_sent_at: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          grace_until?: string | null;
          id?: string;
          messages_used_this_period?: number;
          mp_preapproval_id?: string | null;
          plan_id: number;
          quota_alert_sent_at?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          grace_until?: string | null;
          id?: string;
          messages_used_this_period?: number;
          mp_preapproval_id?: string | null;
          plan_id?: number;
          quota_alert_sent_at?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      dearmor: { Args: { "": string }; Returns: string };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      get_clinic_secret: {
        Args: { p_clinic_id: string; p_kind: string };
        Returns: string;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_clinic_member: { Args: { p_clinic_id: string }; Returns: boolean };
      pgp_armor_headers: {
        Args: { "": string };
        Returns: Record<string, unknown>[];
      };
      set_clinic_secret: {
        Args: { p_clinic_id: string; p_kind: string; p_value: string };
        Returns: undefined;
      };
      shares_clinic_with: { Args: { p_user_id: string }; Returns: boolean };
      storage_clinic_id: { Args: { p_name: string }; Returns: string };
    };
    Enums: {
      appointment_status: "agendado" | "concluido" | "cancelado";
      attendance_state: "ia" | "pendente" | "equipe";
      conversation_status: "aberta" | "concluida" | "abandonada";
      integration_mode: "webhook" | "custom";
      member_role: "owner" | "staff";
      message_role: "user" | "model" | "staff";
      payment_status: "approved" | "rejected";
      subscription_status: "pending" | "authorized" | "paused" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      appointment_status: ["agendado", "concluido", "cancelado"],
      attendance_state: ["ia", "pendente", "equipe"],
      conversation_status: ["aberta", "concluida", "abandonada"],
      integration_mode: ["webhook", "custom"],
      member_role: ["owner", "staff"],
      message_role: ["user", "model", "staff"],
      payment_status: ["approved", "rejected"],
      subscription_status: ["pending", "authorized", "paused", "cancelled"],
    },
  },
} as const;
