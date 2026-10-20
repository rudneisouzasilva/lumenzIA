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
      appointment_log: {
        Row: {
          appointment_id: number | null;
          booked_at: string;
          clinic_id: string;
          contact_id: string | null;
          conversation_id: number | null;
          id: number;
          procedure_name: string;
          professional_name: string;
          source: string;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          appointment_id?: number | null;
          booked_at: string;
          clinic_id: string;
          contact_id?: string | null;
          conversation_id?: number | null;
          id?: never;
          procedure_name?: string;
          professional_name?: string;
          source: string;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          appointment_id?: number | null;
          booked_at?: string;
          clinic_id?: string;
          contact_id?: string | null;
          conversation_id?: number | null;
          id?: never;
          procedure_name?: string;
          professional_name?: string;
          source?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_log_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_log_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_log_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_log_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          clinic_id: string;
          contact_id: string | null;
          contact_phone: string;
          conversation_id: number | null;
          created_at: string;
          ends_at: string;
          external_ref: string | null;
          id: number;
          patient_name: string;
          procedure_name: string;
          professional_name: string;
          reminder_sent_at: string | null;
          source: string;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          contact_id?: string | null;
          contact_phone: string;
          conversation_id?: number | null;
          created_at?: string;
          ends_at: string;
          external_ref?: string | null;
          id?: never;
          patient_name?: string;
          procedure_name?: string;
          professional_name?: string;
          reminder_sent_at?: string | null;
          source?: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
        };
        Update: {
          clinic_id?: string;
          contact_id?: string | null;
          contact_phone?: string;
          conversation_id?: number | null;
          created_at?: string;
          ends_at?: string;
          external_ref?: string | null;
          id?: never;
          patient_name?: string;
          procedure_name?: string;
          professional_name?: string;
          reminder_sent_at?: string | null;
          source?: string;
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
          {
            foreignKeyName: "appointments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
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
          whatsapp_pin_secret_id: string | null;
          whatsapp_token_secret_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agenda_api_key_secret_id?: string | null;
          clinic_id: string;
          updated_at?: string;
          whatsapp_pin_secret_id?: string | null;
          whatsapp_token_secret_id?: string | null;
        };
        Update: {
          agenda_api_key_secret_id?: string | null;
          clinic_id?: string;
          updated_at?: string;
          whatsapp_pin_secret_id?: string | null;
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
          whatsapp_coexistence: boolean;
          whatsapp_connected_at: string | null;
          whatsapp_display_phone: string | null;
          whatsapp_history_messages: number;
          whatsapp_history_progress: number;
          whatsapp_history_status: string;
          whatsapp_phone_number_id: string | null;
          whatsapp_verified_name: string | null;
          whatsapp_waba_id: string | null;
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
          whatsapp_coexistence?: boolean;
          whatsapp_connected_at?: string | null;
          whatsapp_display_phone?: string | null;
          whatsapp_history_messages?: number;
          whatsapp_history_progress?: number;
          whatsapp_history_status?: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_verified_name?: string | null;
          whatsapp_waba_id?: string | null;
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
          whatsapp_coexistence?: boolean;
          whatsapp_connected_at?: string | null;
          whatsapp_display_phone?: string | null;
          whatsapp_history_messages?: number;
          whatsapp_history_progress?: number;
          whatsapp_history_status?: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_verified_name?: string | null;
          whatsapp_waba_id?: string | null;
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
      contacts: {
        Row: {
          clinic_id: string;
          created_at: string;
          first_contact_at: string;
          id: string;
          last_contact_at: string;
          name: string;
          opted_out_at: string | null;
          phone: string;
          updated_at: string;
          whatsapp_name: string;
        };
        ComputedFields: never;
        Insert: {
          clinic_id: string;
          created_at?: string;
          first_contact_at?: string;
          id?: string;
          last_contact_at?: string;
          name?: string;
          opted_out_at?: string | null;
          phone: string;
          updated_at?: string;
          whatsapp_name?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          first_contact_at?: string;
          id?: string;
          last_contact_at?: string;
          name?: string;
          opted_out_at?: string | null;
          phone?: string;
          updated_at?: string;
          whatsapp_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_clinic_id_fkey";
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
          contact_id: string | null;
          contact_phone: string;
          contact_reason_id: string | null;
          id: number;
          imported: boolean;
          last_message_at: string;
          needs_classification: boolean;
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
          contact_id?: string | null;
          contact_phone: string;
          contact_reason_id?: string | null;
          id?: never;
          imported?: boolean;
          last_message_at?: string;
          needs_classification?: boolean;
          needs_human_at?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          summary?: string | null;
        };
        Update: {
          attendance_state?: Database["public"]["Enums"]["attendance_state"];
          clinic_id?: string;
          closed_at?: string | null;
          contact_id?: string | null;
          contact_phone?: string;
          contact_reason_id?: string | null;
          id?: never;
          imported?: boolean;
          last_message_at?: string;
          needs_classification?: boolean;
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
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
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
      message_templates: {
        Row: {
          body: string;
          category: string;
          clinic_id: string;
          created_at: string;
          example: NonNullable<Json>;
          footer: string;
          id: string;
          language: string;
          last_error: string | null;
          meta_template_id: string | null;
          name: string;
          purpose: string;
          rejected_reason: string | null;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          category: string;
          clinic_id: string;
          created_at?: string;
          example?: NonNullable<Json>;
          footer?: string;
          id?: string;
          language?: string;
          last_error?: string | null;
          meta_template_id?: string | null;
          name: string;
          purpose?: string;
          rejected_reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string;
          clinic_id?: string;
          created_at?: string;
          example?: NonNullable<Json>;
          footer?: string;
          id?: string;
          language?: string;
          last_error?: string | null;
          meta_template_id?: string | null;
          name?: string;
          purpose?: string;
          rejected_reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_templates_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
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
          origin: string;
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
          origin?: string;
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
          origin?: string;
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
      add_history_progress: {
        Args: { p_clinic_id: string; p_messages: number; p_progress: number };
        Returns: undefined;
      };
      admin_clinic_members: {
        Args: { p_clinic_id: string };
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          is_admin: boolean;
          last_sign_in_at: string | null;
          phone: string | null;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        }[];
      };
      admin_clinics: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          current_period_end: string | null;
          grace_until: string | null;
          id: string;
          is_active: boolean;
          last_message_at: string | null;
          members: number;
          message_quota: number | null;
          messages_used: number | null;
          name: string;
          owner_email: string | null;
          owner_name: string | null;
          owner_phone: string | null;
          plan_name: string | null;
          subscription_status:
            Database["public"]["Enums"]["subscription_status"] | null;
          whatsapp_display_phone: string | null;
          whatsapp_phone_number_id: string | null;
        }[];
      };
      apply_subscription_payment: {
        Args: {
          p_amount_cents: number;
          p_approved: boolean;
          p_provider_payment_id: string;
          p_subscription_id: string;
        };
        Returns: boolean;
      };
      attendance_inbox: {
        Args: { p_clinic_id: string };
        Returns: {
          attendance_state: Database["public"]["Enums"]["attendance_state"];
          contact_id: string | null;
          contact_name: string | null;
          contact_phone: string;
          id: number;
          last_message: string | null;
          last_message_at: string;
          last_patient_message_at: string | null;
          last_role: Database["public"]["Enums"]["message_role"] | null;
          message_count: number;
          needs_human_at: string | null;
          started_at: string;
        }[];
      };
      clinic_secret_status: { Args: { p_clinic_id: string }; Returns: Json };
      conversation_stats: {
        Args: { p_clinic_id: string; p_from: string; p_to: string };
        Returns: Json;
      };
      count_ai_message: {
        Args: { p_subscription_id: string };
        Returns: undefined;
      };
      dearmor: { Args: { "": string }; Returns: string };
      due_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: {
          clinic_id: string;
          contact_phone: string;
          external_ref: string | null;
          id: number;
          patient_name: string;
          procedure_name: string;
          starts_at: string;
        }[];
      };
      ensure_contact: {
        Args: { p_clinic_id: string; p_name?: string; p_phone: string };
        Returns: string;
      };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      get_clinic_secret: {
        Args: { p_clinic_id: string; p_kind: string };
        Returns: string;
      };
      idle_conversations: {
        Args: { p_default_hours: number; p_limit: number };
        Returns: { clinic_id: string; id: number; last_message_at: string }[];
      };
      invoke_cron_route: { Args: { p_path: string }; Returns: number };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_clinic_member: { Args: { p_clinic_id: string }; Returns: boolean };
      launch_status: { Args: { p_cron_secret: string }; Returns: Json };
      pgp_armor_headers: {
        Args: { "": string };
        Returns: Record<string, unknown>[];
      };
      run_daily_cleanup: { Args: Record<PropertyKey, never>; Returns: Json };
      set_clinic_secret: {
        Args: { p_clinic_id: string; p_kind: string; p_value: string };
        Returns: undefined;
      };
      set_cron_app_url: { Args: { p_url: string }; Returns: undefined };
      shares_clinic_with: { Args: { p_user_id: string }; Returns: boolean };
      storage_clinic_id: { Args: { p_name: string }; Returns: string };
      unclassified_conversations: {
        Args: { p_limit: number };
        Returns: { clinic_id: string; id: number }[];
      };
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
