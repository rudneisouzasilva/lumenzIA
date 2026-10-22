import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { nationalHolidayOn } from "@/lib/ai/holidays";
import {
  pickActiveSubscription,
  type SubscriptionRow,
} from "@/lib/billing/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Sender } from "@/lib/whatsapp/client";
import { DEFAULT_CONVERSATION_TIMEOUT_HOURS } from "@/lib/whatsapp/conversations";
import { getClinicSender } from "@/lib/whatsapp/sender";
import { sendTemplateMessage, templateFor } from "@/lib/whatsapp/templates";

import { deadline } from "./cron";

type Admin = SupabaseClient<Database>;
type Due = Database["public"]["Functions"]["due_follow_ups"]["Returns"][number];
type Template = { name: string; language: string; body: string };

const BATCH = 60;
// Depois de 3 falhas de envio seguidas, a retomada fica como "falhou" no painel.
const MAX_FAILURES = 3;
// Sem horário cadastrado: segunda a sábado, das 9h às 18h. E nunca de madrugada.
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];
const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";
const EARLIEST = "08:00";
const LATEST = "20:00";

export const DEFAULT_TOPIC = "o seu atendimento";

type Clinic = {
  name: string;
  assistant_name: string;
  work_days: number[];
  work_hours_start: string | null;
  work_hours_end: string | null;
  works_on_holidays: boolean;
  conversation_timeout_hours: number | null;
};

type ClinicReady =
  | {
      ok: true;
      clinic: Clinic;
      sender: Sender;
      templates: { pedido: Template | null; padrao: Template | null };
    }
  | { ok: false; why: string };

/** Dia da semana (1 = segunda ... 7 = domingo) e "HH:MM" agora em Brasília. */
function brasiliaClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) +
    1;
  return { weekday, time: `${parts.hour}:${parts.minute}` };
}

/** A retomada só sai no expediente da clínica, fora dos feriados em que ela fecha. */
export function inSendWindow(clinic: Clinic, now = new Date()) {
  if (!clinic.works_on_holidays && nationalHolidayOn(now)) return false;
  const { weekday, time } = brasiliaClock(now);
  const days = clinic.work_days.length ? clinic.work_days : DEFAULT_DAYS;
  if (!days.includes(weekday)) return false;
  const start = clinic.work_hours_start?.slice(0, 5) ?? DEFAULT_START;
  const end = clinic.work_hours_end?.slice(0, 5) ?? DEFAULT_END;
  const from = start > EARLIEST ? start : EARLIEST;
  const to = end < LATEST ? end : LATEST;
  return time >= from && time < to;
}

async function prepareClinic(
  admin: Admin,
  clinicId: string,
): Promise<ClinicReady> {
  const [{ data: clinic }, { data: subs }] = await Promise.all([
    admin
      .from("clinics")
      .select(
        "name, assistant_name, work_days, work_hours_start, work_hours_end, works_on_holidays, conversation_timeout_hours",
      )
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
  ]);
  if (!pickActiveSubscription(subs as SubscriptionRow[]))
    return { ok: false, why: "assinatura vencida" };
  if (!inSendWindow(clinic)) return { ok: false, why: "fora do expediente" };
  const [pedido, padrao] = await Promise.all([
    templateFor(admin, clinicId, "retomada_pedido"),
    templateFor(admin, clinicId, "retomada_sem_resposta"),
  ]);
  if (!pedido && !padrao)
    return { ok: false, why: "sem mensagem de retomada aprovada" };
  const sender = await getClinicSender(admin, clinicId);
  if (!sender) return { ok: false, why: "WhatsApp não conectado" };
  return { ok: true, clinic, sender, templates: { pedido, padrao } };
}

async function cancel(admin: Admin, id: number, reason: string) {
  await admin
    .from("follow_ups")
    .update({ status: "cancelado", cancel_reason: reason })
    .eq("id", id)
    .eq("status", "pendente")
    .throwOnError();
}

/** A pessoa está numa conversa em andamento: a retomada espera ela terminar. */
async function hasOpenConversation(admin: Admin, clinic: Clinic, due: Due) {
  const hours =
    clinic.conversation_timeout_hours ?? DEFAULT_CONVERSATION_TIMEOUT_HOURS;
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", due.contact_id)
    .eq("status", "aberta")
    .gt(
      "last_message_at",
      new Date(Date.now() - hours * 3600_000).toISOString(),
    )
    .limit(1)
    .throwOnError();
  return data.length > 0;
}

async function send(admin: Admin, ready: ClinicReady, due: Due) {
  if (due.opted_out_at) {
    await cancel(admin, due.id, "descadastro");
    return "cancelled";
  }
  // Contato só do Instagram, que nunca informou o WhatsApp: não há por onde retomar.
  const phone = due.phone;
  if (!phone) {
    await cancel(admin, due.id, "sem_whatsapp");
    return "cancelled";
  }
  if (!ready.ok) return "skipped";
  if (await hasOpenConversation(admin, ready.clinic, due)) return "skipped";

  const template =
    due.source === "cliente"
      ? (ready.templates.pedido ?? ready.templates.padrao)
      : (ready.templates.padrao ?? ready.templates.pedido);
  if (!template) return "skipped";

  // Marca antes de enviar, e só se ninguém marcou: duas rodadas juntas mandam uma mensagem só.
  const sentAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("follow_ups")
    .update({ status: "enviado", sent_at: sentAt })
    .eq("id", due.id)
    .eq("status", "pendente")
    .select("id")
    .throwOnError();
  if (!claimed.length) return "skipped";

  let text: string;
  try {
    text = await sendTemplateMessage(ready.sender, phone, template, [
      ready.clinic.assistant_name,
      ready.clinic.name,
      due.reason.trim() || DEFAULT_TOPIC,
    ]);
  } catch (e) {
    const failures = due.failures + 1;
    const { error } = await admin
      .from("follow_ups")
      .update({
        status: failures >= MAX_FAILURES ? "falhou" : "pendente",
        sent_at: null,
        failures,
        last_error: (e as Error).message.slice(0, 300),
      })
      .eq("id", due.id);
    if (error?.code === "23505") {
      // Outra retomada pendente para o contato foi marcada no meio do envio: esta sai da fila.
      await admin
        .from("follow_ups")
        .update({
          status: "falhou",
          sent_at: null,
          failures,
          last_error: (e as Error).message.slice(0, 300),
        })
        .eq("id", due.id);
    } else if (error) {
      console.error("[retomadas] desfazer envio:", error.message);
    }
    throw e;
  }

  // A mensagem abre uma conversa nova com a assistente; a resposta da pessoa cai nela.
  const { data: conversation } = await admin
    .from("conversations")
    .insert({
      clinic_id: due.clinic_id,
      contact_phone: phone,
      attendance_state: "ia",
      follow_up_id: due.id,
      last_message_at: sentAt,
    })
    .select("id")
    .single()
    .throwOnError();
  await Promise.all([
    admin
      .from("messages")
      .insert({
        clinic_id: due.clinic_id,
        conversation_id: conversation.id,
        contact_phone: phone,
        role: "model",
        origin: "retomada",
        content: text || `Mensagem pronta "${template.name}" enviada.`,
      })
      .throwOnError(),
    admin
      .from("follow_ups")
      .update({ sent_conversation_id: conversation.id })
      .eq("id", due.id)
      .throwOnError(),
  ]);
  return "sent";
}

/** Envia as retomadas cuja data chegou, no horário de cada clínica. Roda a cada 15 minutos. */
export async function runFollowUps(budgetMs: number) {
  const admin = createAdminClient();
  const { data: due } = await admin
    .rpc("due_follow_ups", { p_limit: BATCH })
    .throwOnError();

  const hasTime = deadline(budgetMs);
  const clinics = new Map<string, Promise<ClinicReady>>();
  const counts = {
    found: due.length,
    sent: 0,
    cancelled: 0,
    skipped: 0,
    failed: 0,
  };
  const waiting = new Map<string, string>();
  const skipped: number[] = [];
  for (const item of due) {
    if (!hasTime()) break;
    try {
      if (!clinics.has(item.clinic_id)) {
        clinics.set(item.clinic_id, prepareClinic(admin, item.clinic_id));
      }
      const ready = await clinics.get(item.clinic_id)!;
      const outcome = await send(admin, ready, item);
      counts[outcome]++;
      if (outcome === "skipped") skipped.push(item.id);
      if (!ready.ok) waiting.set(item.clinic_id, ready.why);
    } catch (e) {
      counts.failed++;
      console.error(`[retomadas] retomada ${item.id}:`, (e as Error).message);
    }
  }
  if (skipped.length) {
    const { error } = await admin
      .from("follow_ups")
      .update({ checked_at: new Date().toISOString() })
      .in("id", skipped)
      .eq("status", "pendente");
    if (error) console.error("[retomadas] marcar espera:", error.message);
  }
  for (const [clinicId, why] of waiting) {
    if (why !== "fora do expediente") {
      console.warn(`[retomadas] clínica ${clinicId} esperando: ${why}.`);
    }
  }
  return counts;
}
