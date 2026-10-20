import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Admin = SupabaseClient<Database>;

/** Tempo sem mensagens que encerra uma conversa, quando a clínica não escolheu outro. */
export const DEFAULT_CONVERSATION_TIMEOUT_HOURS = 6;

export type InboundClinic = {
  id: string;
  is_active: boolean;
  conversation_timeout_hours: number | null;
  staff_phone_number: string | null;
  staff_alert_template_name: string | null;
  template_language: string;
};

/** A clínica dona do número, ou null se o número não é de nenhuma clínica da LumenzIA. */
export async function clinicByPhoneNumberId(
  admin: Admin,
  phoneNumberId: string,
): Promise<InboundClinic | null> {
  const { data } = await admin
    .from("clinics")
    .select(
      "id, is_active, conversation_timeout_hours, staff_phone_number, staff_alert_template_name, template_language",
    )
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle()
    .throwOnError();
  return data;
}

/**
 * A conversa aberta do contato, se ainda estiver dentro do tempo limite; senão, uma nova.
 * `newState` é quem atende uma conversa nova: a IA, ou a equipe quando a IA não pode responder.
 */
export async function findOrCreateConversation(
  admin: Admin,
  clinic: Pick<InboundClinic, "id" | "conversation_timeout_hours">,
  phone: string,
  newState: Database["public"]["Enums"]["attendance_state"] = "ia",
) {
  const hours =
    clinic.conversation_timeout_hours ?? DEFAULT_CONVERSATION_TIMEOUT_HOURS;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data: open } = await admin
    .from("conversations")
    .select("id, attendance_state, contact_id")
    .eq("clinic_id", clinic.id)
    .eq("contact_phone", phone)
    .eq("status", "aberta")
    .gt("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();
  if (open) return open;

  const { data: created } = await admin
    .from("conversations")
    .insert({
      clinic_id: clinic.id,
      contact_phone: phone,
      attendance_state: newState,
    })
    .select("id, attendance_state, contact_id")
    .single()
    .throwOnError();
  return created;
}

/** Hora em que o celular enviou (a Meta reentrega mensagens atrasadas). */
export function whatsappTime(timestamp: string | undefined) {
  return Number(timestamp) > 0
    ? new Date(Number(timestamp) * 1000).toISOString()
    : undefined;
}
