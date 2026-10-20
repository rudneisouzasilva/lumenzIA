import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, classifyConversation } from "@/lib/ai/engine";
import {
  brasiliaDatePlus,
  checkFollowUpDate,
  setPendingFollowUp,
} from "@/lib/ai/follow-up";
import { isoDateInBrasilia } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type Admin = SupabaseClient<Database>;

/** Motivo usado quando a IA não encaixa a conversa em nenhum dos cadastrados pela clínica. */
export const OTHER_REASON = "Outros assuntos";

/** O motivo "Outros assuntos" da clínica, criado na primeira vez que for preciso. */
async function otherReasonId(admin: Admin, clinicId: string) {
  const { data: existing } = await admin
    .from("contact_reasons")
    .select("id")
    .eq("clinic_id", clinicId)
    .ilike("name", OTHER_REASON)
    .limit(1)
    .maybeSingle()
    .throwOnError();
  if (existing) return existing.id;

  const { data: created } = await admin
    .from("contact_reasons")
    .insert({
      clinic_id: clinicId,
      name: OTHER_REASON,
      description:
        "Criado automaticamente para conversas cujo motivo não combinou com nenhum dos cadastrados.",
      sort_order: 999,
    })
    .select("id")
    .single()
    .throwOnError();
  return created.id;
}

type Values = Database["public"]["Tables"]["conversations"]["Update"];

type Classified = {
  values: Values;
  /** O paciente escreveu alguma coisa. */
  answered: boolean;
  followUpDate: string | null;
  topic: string;
};

/**
 * Motivo, desfecho e resumo de uma conversa, pela IA. Sem nenhuma mensagem do paciente não há o
 * que classificar: fica "abandonada", sem gastar a IA.
 */
async function classify(
  admin: Admin,
  conversation: { id: number; clinic_id: string },
): Promise<Classified> {
  const [{ data: messages }, { data: reasons }] = await Promise.all([
    admin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("id")
      .throwOnError(),
    admin
      .from("contact_reasons")
      .select("id, name, description")
      .eq("clinic_id", conversation.clinic_id)
      .order("sort_order")
      .throwOnError(),
  ]);
  if (!messages.some((m) => m.role === "user")) {
    return {
      values: { status: "abandonada" },
      answered: false,
      followUpDate: null,
      topic: "",
    };
  }

  const result = await classifyConversation({
    reasons,
    messages,
    today: isoDateInBrasilia(),
  });
  const reasonId = result.reason
    ? reasons.find((r) => r.name === result.reason)!.id
    : await otherReasonId(admin, conversation.clinic_id);
  return {
    values: {
      status: result.status,
      contact_reason_id: reasonId,
      summary: result.summary || null,
    },
    answered: true,
    followUpDate: result.followUpDate,
    topic: result.topic,
  };
}

/**
 * Depois de encerrar: marca a retomada, se a clínica quiser. Na ordem:
 *  1. quem pediu para não receber mensagens, ou já tem retomada marcada, fica como está;
 *  2. quem agendou não precisa de retomada;
 *  3. a data pedida pela própria pessoa vence o padrão da clínica;
 *  4. uma retomada que ficou sem resposta tenta de novo, até o limite de tentativas;
 *  5. senão, o prazo padrão da clínica para abandonadas ou concluídas sem agendamento.
 */
async function planFollowUp(
  admin: Admin,
  conversationId: number,
  classified: Classified,
) {
  const { data: conversation } = await admin
    .from("conversations")
    .select(
      "id, clinic_id, contact_id, status, follow_up_id, clinics(followup_abandoned_days, followup_concluded_days, followup_max_attempts), contacts(opted_out_at)",
    )
    .eq("id", conversationId)
    .single()
    .throwOnError();
  const contactId = conversation.contact_id;
  const clinic = conversation.clinics;
  if (!contactId || !clinic || conversation.contacts?.opted_out_at) return;

  const [{ data: pending }, { data: booked }, { data: logged }] =
    await Promise.all([
      admin
        .from("follow_ups")
        .select("id")
        .eq("contact_id", contactId)
        .eq("status", "pendente")
        .limit(1)
        .throwOnError(),
      admin
        .from("appointments")
        .select("id")
        .eq("contact_id", contactId)
        .eq("status", "agendado")
        .gt("starts_at", new Date().toISOString())
        .limit(1)
        .throwOnError(),
      admin
        .from("appointment_log")
        .select("id")
        .eq("conversation_id", conversationId)
        .limit(1)
        .throwOnError(),
    ]);
  if (pending.length || booked.length || logged.length) return;

  const base = {
    clinicId: conversation.clinic_id,
    contactId,
    conversationId,
  };

  if (classified.followUpDate) {
    const checked = checkFollowUpDate(classified.followUpDate);
    if ("date" in checked) {
      await setPendingFollowUp(admin, {
        ...base,
        date: checked.date,
        source: "cliente",
        reason: classified.topic,
      });
      return;
    }
  }

  // Conversa aberta por uma retomada que ficou sem resposta.
  if (conversation.follow_up_id && !classified.answered) {
    const { data: previous } = await admin
      .from("follow_ups")
      .select("attempt, reason")
      .eq("id", conversation.follow_up_id)
      .maybeSingle()
      .throwOnError();
    const days =
      clinic.followup_abandoned_days ?? clinic.followup_concluded_days ?? 7;
    if (previous && previous.attempt < clinic.followup_max_attempts) {
      await setPendingFollowUp(admin, {
        ...base,
        date: brasiliaDatePlus(days),
        source: "padrao",
        reason: previous.reason,
        attempt: previous.attempt + 1,
      });
    }
    return;
  }

  const days =
    conversation.status === "abandonada"
      ? clinic.followup_abandoned_days
      : conversation.status === "concluida"
        ? clinic.followup_concluded_days
        : null;
  if (!days) return;
  await setPendingFollowUp(admin, {
    ...base,
    date: brasiliaDatePlus(days),
    source: "padrao",
    reason: classified.topic,
  });
}

/**
 * Encerra uma conversa em andamento e classifica motivo, desfecho e resumo com a IA.
 *
 * Se a IA falhar, `fallback` decide: true encerra mesmo assim, sem motivo (quem clicou em
 * "Encerrar" no painel quer a conversa fechada); false deixa aberta para o próximo job tentar de
 * novo. Devolve false quando a conversa já tinha sido encerrada por outra pessoa ou job.
 */
export async function closeConversation(
  admin: Admin,
  conversation: { id: number; clinic_id: string },
  { fallback }: { fallback: boolean },
) {
  let classified: Classified;
  try {
    classified = await classify(admin, conversation);
  } catch (e) {
    if (!fallback || !(e instanceof AiError)) throw e;
    classified = {
      values: { status: "concluida" },
      answered: true,
      followUpDate: null,
      topic: "",
    };
  }

  // Só fecha se ainda estiver aberta: o job e alguém no painel podem chegar juntos.
  const { data } = await admin
    .from("conversations")
    .update({ ...classified.values, closed_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("status", "aberta")
    .select("id")
    .throwOnError();
  if (!data.length) return false;

  try {
    await planFollowUp(admin, conversation.id, classified);
  } catch (e) {
    // A conversa já está encerrada; a retomada é um extra.
    console.error(
      `[retomada] planejar conversa ${conversation.id}:`,
      (e as Error).message,
    );
  }
  return true;
}

/**
 * Classifica uma conversa importada do celular (já encerrada). Uma tentativa só: se a IA falhar,
 * a conversa fica sem motivo, para não tentar a mesma para sempre.
 */
export async function classifyImported(
  admin: Admin,
  conversation: { id: number; clinic_id: string },
) {
  let values: Values = {};
  try {
    values = (await classify(admin, conversation)).values;
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
  }
  await admin
    .from("conversations")
    .update({ ...values, needs_classification: false })
    .eq("id", conversation.id)
    .throwOnError();
}
