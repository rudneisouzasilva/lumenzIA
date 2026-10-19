import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { Sender } from "./client";

/**
 * Número e token de WhatsApp da clínica, para enviar mensagens fora do webhook (resposta da equipe,
 * lembretes). null quando a clínica ainda não tem o número conectado.
 */
export async function getClinicSender(
  admin: SupabaseClient<Database>,
  clinicId: string,
): Promise<Sender | null> {
  const [{ data: clinic }, { data: accessToken }] = await Promise.all([
    admin
      .from("clinics")
      .select("whatsapp_phone_number_id")
      .eq("id", clinicId)
      .single()
      .throwOnError(),
    admin
      .rpc("get_clinic_secret", {
        p_clinic_id: clinicId,
        p_kind: "whatsapp_token",
      })
      .throwOnError(),
  ]);
  if (!clinic.whatsapp_phone_number_id || !accessToken) return null;
  return { phoneNumberId: clinic.whatsapp_phone_number_id, accessToken };
}
