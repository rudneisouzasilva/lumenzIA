import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Integration } from "@/lib/ai/agenda";
import {
  pickActiveSubscription,
  type SubscriptionRow,
} from "@/lib/billing/subscription";
import { parseBookingFields } from "@/lib/booking-fields";
import { isoDateInBrasilia } from "@/lib/format";
import { emailConfigured, sendEmail } from "@/lib/notifications/email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Sender } from "@/lib/whatsapp/client";
import { getClinicSender } from "@/lib/whatsapp/sender";
import { sendTemplateMessage, templateFor } from "@/lib/whatsapp/templates";

import { listExternalAgenda } from "./agenda-sync";
import { deadline } from "./cron";

type Admin = SupabaseClient<Database>;
type Due = Database["public"]["Functions"]["due_reminders"]["Returns"][number];

/** "segunda-feira, 20/10, 14:30" no horário de Brasília. */
function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type ClinicReady =
  | {
      ok: true;
      clinicName: string;
      /** Número e template de lembrete aprovado (null se o WhatsApp não está pronto). */
      whatsapp: {
        sender: Sender;
        template: { name: string; language: string; body: string };
      } | null;
      /** A clínica quer o lembrete também por e-mail (e o e-mail é pedido no agendamento). */
      email: boolean;
      integration: Integration;
    }
  | { ok: false; why: string };

/** Pode mandar lembrete por esta clínica? (assistente ligada, assinatura e algum canal pronto) */
async function prepareClinic(
  admin: Admin,
  clinicId: string,
): Promise<ClinicReady> {
  const [{ data: clinic }, { data: subs }, { data: integration }] =
    await Promise.all([
      admin
        .from("clinics")
        .select("name, is_active, reminder_by_email, booking_fields")
        .eq("id", clinicId)
        .single()
        .throwOnError(),
      admin
        .from("subscriptions")
        .select("*, plans(code, name, message_quota)")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(10)
        .throwOnError(),
      admin
        .from("integrations")
        .select("*")
        .eq("clinic_id", clinicId)
        .single()
        .throwOnError(),
    ]);
  if (!clinic.is_active) return { ok: false, why: "assistente pausada" };
  if (!pickActiveSubscription(subs as SubscriptionRow[]))
    return { ok: false, why: "assinatura vencida" };

  const [template, sender] = await Promise.all([
    templateFor(admin, clinicId, "lembrete"),
    getClinicSender(admin, clinicId),
  ]);
  const email =
    clinic.reminder_by_email &&
    parseBookingFields(clinic.booking_fields).email !== "desligado" &&
    emailConfigured();
  if (!(template && sender) && !email) {
    return {
      ok: false,
      why: sender
        ? "sem template de lembrete aprovado"
        : "WhatsApp não conectado",
    };
  }
  return {
    ok: true,
    clinicName: clinic.name,
    whatsapp: template && sender ? { sender, template } : null,
    email,
    integration,
  };
}

/**
 * Confere na agenda de verdade se o agendamento ainda existe (pode ter sido desmarcado depois da
 * última sincronização). Sem id externo, ou se a agenda não responder, considera que existe:
 * melhor avisar do que deixar de avisar.
 */
async function stillScheduled(integration: Integration, appointment: Due) {
  if (!appointment.external_ref) return true;
  const day = isoDateInBrasilia(new Date(appointment.starts_at));
  const { list, erro } = await listExternalAgenda(integration, day, day);
  if (!list) {
    console.warn(
      `[lembretes] não deu para conferir o agendamento ${appointment.id}: ${erro}`,
    );
    return true;
  }
  return list.some(
    (item) => item.id != null && String(item.id) === appointment.external_ref,
  );
}

async function remind(admin: Admin, ready: ClinicReady, appointment: Due) {
  if (!ready.ok) return "skipped";
  const byEmail = ready.email && !!appointment.patient_email;
  // Sem WhatsApp pronto e sem e-mail desta pessoa, não há por onde avisar.
  if (!ready.whatsapp && !byEmail) return "skipped";

  if (!(await stillScheduled(ready.integration, appointment))) {
    await admin
      .from("appointments")
      .update({ status: "cancelado" })
      .eq("id", appointment.id)
      .throwOnError();
    return "cancelled";
  }

  // Marca antes de enviar, e só se ninguém marcou: duas rodadas juntas mandam um lembrete só.
  const { data: claimed } = await admin
    .from("appointments")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", appointment.id)
    .is("reminder_sent_at", null)
    .select("id")
    .throwOnError();
  if (!claimed.length) return "skipped";

  const firstName = appointment.patient_name.trim().split(/\s+/)[0] || "você";
  const when = formatWhen(appointment.starts_at);
  let delivered = false;
  let failure: unknown = null;

  // O template aprovado na Meta precisa ter 2 variáveis no corpo: {{1}} nome, {{2}} data e hora.
  if (ready.whatsapp) {
    try {
      await sendTemplateMessage(
        ready.whatsapp.sender,
        appointment.contact_phone,
        ready.whatsapp.template,
        [firstName, when],
      );
      delivered = true;
    } catch (e) {
      failure = e;
      console.error(
        `[lembretes] WhatsApp do agendamento ${appointment.id}:`,
        (e as Error).message,
      );
    }
  }

  if (byEmail) {
    try {
      await sendEmail({
        to: appointment.patient_email!,
        fromName: ready.clinicName,
        subject: `Lembrete do seu horário · ${ready.clinicName}`,
        text: [
          `Olá, ${firstName}!`,
          "",
          `Passando para lembrar do seu horário na ${ready.clinicName}: ${when}${appointment.procedure_name ? ` (${appointment.procedure_name})` : ""}.`,
          "",
          "Se precisar remarcar, é só responder no WhatsApp da clínica.",
          "",
          ready.clinicName,
        ].join("\n"),
      });
      delivered = true;
    } catch (e) {
      failure ??= e;
      console.error(
        `[lembretes] e-mail do agendamento ${appointment.id}:`,
        (e as Error).message,
      );
    }
  }

  if (!delivered) {
    // Nenhum canal entregou: desmarca para tentar de novo na próxima rodada, enquanto ainda
    // estiver na janela. Se um canal entregou, não repete (a pessoa já foi avisada).
    await admin
      .from("appointments")
      .update({ reminder_sent_at: null })
      .eq("id", appointment.id);
    throw failure ?? new Error("nenhum canal disponível para este agendamento");
  }
  return "sent";
}

/** Envia os lembretes de agendamento que entraram na janela escolhida por cada clínica. */
export async function runReminders(budgetMs: number) {
  const admin = createAdminClient();
  const { data: due } = await admin.rpc("due_reminders").throwOnError();

  const hasTime = deadline(budgetMs);
  const clinics = new Map<string, Promise<ClinicReady>>();
  const counts = {
    found: due.length,
    sent: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
  };
  for (const appointment of due) {
    if (!hasTime()) break;
    try {
      if (!clinics.has(appointment.clinic_id)) {
        clinics.set(
          appointment.clinic_id,
          prepareClinic(admin, appointment.clinic_id),
        );
      }
      const ready = await clinics.get(appointment.clinic_id)!;
      const outcome = await remind(admin, ready, appointment);
      counts[outcome]++;
      if (!ready.ok && outcome === "skipped") {
        console.warn(
          `[lembretes] agendamento ${appointment.id} não avisado: ${ready.why}.`,
        );
      }
    } catch (e) {
      counts.failed++;
      console.error(
        `[lembretes] agendamento ${appointment.id}:`,
        (e as Error).message,
      );
    }
  }
  return counts;
}
