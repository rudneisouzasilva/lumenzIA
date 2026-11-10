import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { phoneVariants } from "@/lib/format";
import { sendText, type Sender } from "@/lib/whatsapp/client";
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
 * Avisa a equipe pelos canais que a clínica escolheu (WhatsApp, por mensagem comum ou pelo template
 * "aviso à equipe",
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");

  if (channels.includes("whatsapp") && clinic.staff_phone_number && sender) {
    try {
      await sendStaffWhatsapp(
        admin,
        clinicId,
        sender,
        clinic.staff_phone_number,
        alert,
        appUrl,
      );
    } catch (e) {
      console.error("[avisos] WhatsApp da equipe:", (e as Error).message);
    }
  }

  if (
    channels.includes("email") &&
    clinic.staff_alert_email &&
    emailConfigured()
  ) {
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

/**
 * Com a janela de 24 horas aberta, o aviso vai como mensagem comum (sem custo de modelo). Fora
 * dela, ou se a Meta recusar o texto, vai pelo modelo "aviso à equipe".
 */
async function sendStaffWhatsapp(
  admin: Admin,
  clinicId: string,
  sender: Sender,
  phone: string,
  alert: StaffAlert,
  appUrl: string | undefined,
) {
  if (await staffWindowOpen(admin, clinicId, phone)) {
    try {
      await sendText(
        sender,
        phone,
        [
          `🔔 ${alert.title}`,
          "",
          alert.params[0],
          alert.params[1],
          "",
          appUrl
            ? `Responder no painel: ${appUrl}/painel/atendimento`
            : "Confira no painel de atendimento.",
        ].join("\n"),
      );
      return;
    } catch (e) {
      // A Meta conta a janela pelo relógio dela: se já fechou, vai pelo modelo.
      console.warn(
        "[avisos] texto para a equipe recusado, usando o modelo:",
        (e as Error).message,
      );
    }
  }
  const template = await templateFor(admin, clinicId, "aviso_equipe");
  if (!template) {
    console.warn("[avisos] template de aviso à equipe não aprovado.");
    return;
  }
  await sendTemplateMessage(sender, phone, template, alert.params);
}

/**
 * A equipe escreveu para o número da clínica nas últimas 24 horas? Então a Meta deixa mandar
 * mensagem comum para ela, sem modelo. Margem de 1 hora para não bater no limite.
 */
async function staffWindowOpen(admin: Admin, clinicId: string, phone: string) {
  const since = new Date(Date.now() - 23 * 3600_000).toISOString();
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("role", "user")
    .in("contact_phone", phoneVariants(phone))
    .gt("created_at", since)
    .limit(1)
    .throwOnError();
  return Boolean(data?.length);
}
