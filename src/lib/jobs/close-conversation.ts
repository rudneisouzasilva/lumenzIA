import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, classifyConversation } from "@/lib/ai/engine";
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

  let values: Database["public"]["Tables"]["conversations"]["Update"];
  if (!messages.length) {
    values = { status: "abandonada" };
  } else {
    try {
      const result = await classifyConversation({ reasons, messages });
      const reasonId = result.reason
        ? reasons.find((r) => r.name === result.reason)!.id
        : await otherReasonId(admin, conversation.clinic_id);
      values = {
        status: result.status,
        contact_reason_id: reasonId,
        summary: result.summary || null,
      };
    } catch (e) {
      if (!fallback || !(e instanceof AiError)) throw e;
      values = { status: "concluida" };
    }
  }

  // Só fecha se ainda estiver aberta: o job e alguém no painel podem chegar juntos.
  const { data } = await admin
    .from("conversations")
    .update({ ...values, closed_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("status", "aberta")
    .select("id")
    .throwOnError();
  return data.length > 0;
}
