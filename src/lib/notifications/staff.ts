import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { Sender } from "@/lib/whatsapp/client";
import { sendTemplateMessage, templateFor } from "@/lib/whatsapp/templates";

import { parseStaffChannels } from "./channels";
import { emailConfigured, sendEmail } from "./email";

type Admin = SupabaseClient<Database>;

export type StaffAlert = {
  /** Assunto do e-mail, ex.: "Paciente pedindo atendimento". */
  title: string;
  /** As duas variáveis do template "aviso à equipe": {{1}} paciente ou assunto, {{2}} detalhes. */
  params: [string, string];
};

/**
 * Avisa a equipe pelos canais que a clínica escolheu (WhatsApp pelo template "aviso à equipe",
 * e-mail pelo Resend). Cada canal falha sozinho, sem impedir os outros. `sender` é o WhatsApp da
 * clínica (null quando não está conectado).
 */
export async function notifyStaff(
  admin: Admin,
  clinicId: string,
  sender: Sender | null,
  alert: StaffAlert,
) {
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, staff_alert_channels, staff_phone_number, staff_alert_email")
    .eq("id", clinicId)
    .single()
    .throwOnError();
  const channels = parseStaffChannels(clinic.staff_alert_channels);

  if (channels.includes("whatsapp") && clinic.staff_phone_number && sender) {
    try {
      const template = await templateFor(admin, clinicId, "aviso_equipe");
      if (template) {
        await sendTemplateMessage(
          sender,
          clinic.staff_phone_number,
          template,
          alert.params,
        );
      } else {
        console.warn("[avisos] template de aviso à equipe não aprovado.");
      }
    } catch (e) {
      console.error("[avisos] WhatsApp da equipe:", (e as Error).message);
    }
  }

  if (
    channels.includes("email") &&
    clinic.staff_alert_email &&
    emailConfigured()
  ) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
    try {
      await sendEmail({
        to: clinic.staff_alert_email,
        subject: `${alert.title} · ${clinic.name}`,
        text: [
          `Aviso da assistente LumenzIA para ${clinic.name}.`,
          "",
          `${alert.params[0]}`,
          `${alert.params[1]}`,
          "",
          appUrl
            ? `Abra o painel para responder: ${appUrl}/painel/atendimento`
            : "Abra o painel da LumenzIA para responder.",
        ].join("\n"),
      });
    } catch (e) {
      console.error("[avisos] e-mail da equipe:", (e as Error).message);
    }
  }
}
