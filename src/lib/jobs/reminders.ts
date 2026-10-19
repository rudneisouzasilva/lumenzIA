import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Integration } from "@/lib/ai/agenda";
import {
  pickActiveSubscription,
  type SubscriptionRow,
} from "@/lib/billing/subscription";
import { isoDateInBrasilia } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendTemplate, type Sender } from "@/lib/whatsapp/client";
import { getClinicSender } from "@/lib/whatsapp/sender";

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
      sender: Sender;
      template: string;
      language: string;
      integration: Integration;
    }
  | { ok: false; why: string };

/** Pode mandar lembrete por esta clínica? (assistente ligada, número, template e assinatura) */
async function prepareClinic(
  admin: Admin,
  clinicId: string,
): Promise<ClinicReady> {
  const [{ data: clinic }, { data: subs }, { data: integration }] =
    await Promise.all([
      admin
        .from("clinics")
        .select("is_active, reminder_template_name, template_language")
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
  if (!clinic.reminder_template_name)
    return { ok: false, why: "sem template de lembrete configurado" };
  if (!pickActiveSubscription(subs as SubscriptionRow[]))
    return { ok: false, why: "assinatura vencida" };
  const sender = await getClinicSender(admin, clinicId);
  if (!sender) return { ok: false, why: "WhatsApp não conectado" };
  return {
    ok: true,
    sender,
    template: clinic.reminder_template_name,
    language: clinic.template_language,
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

  // O template aprovado na Meta precisa ter 2 variáveis no corpo: {{1}} nome, {{2}} data e hora.
  const firstName = appointment.patient_name.trim().split(/\s+/)[0] || "você";
  try {
    await sendTemplate(
      ready.sender,
      appointment.contact_phone,
      ready.template,
      ready.language,
      [firstName, formatWhen(appointment.starts_at)],
    );
  } catch (e) {
    // Desmarca para tentar de novo na próxima rodada, enquanto ainda estiver na janela.
    await admin
      .from("appointments")
      .update({ reminder_sent_at: null })
      .eq("id", appointment.id);
    throw e;
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
