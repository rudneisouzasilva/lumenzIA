import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isoDateInBrasilia } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Retomadas: quando a LumenzIA volta a chamar um contato numa data. Aqui ficam a ferramenta que a
 * IA usa durante a conversa ("pode me chamar dia 10") e o registro de uma retomada pendente.
 */

type Admin = SupabaseClient<Database>;

/** As retomadas saem às 10h de Brasília do dia marcado (ou na primeira hora de expediente depois). */
const SEND_HOUR_BRASILIA = 10;
/** Mais longe que isso, a pessoa provavelmente não lembra mais da conversa. */
export const MAX_FOLLOW_UP_DAYS = 400;

export const FOLLOW_UP_TOOL = {
  name: "agendar_retorno",
  description:
    'Registra que a clínica deve voltar a falar com a pessoa numa data que ela mesma pediu (ex.: "me chama mês que vem", "depois do dia 10 eu vejo"). A LumenzIA manda a mensagem sozinha nesse dia. Só use quando a pessoa pedir para ser procurada depois.',
  parametersJsonSchema: {
    type: "object",
    properties: {
      data: {
        type: "string",
        description:
          'Dia do retorno, formato AAAA-MM-DD. Para um período ("mês que vem", "depois das férias"), use o primeiro dia útil dele.',
      },
      assunto: {
        type: "string",
        description:
          'O que a pessoa quer retomar, em até 6 palavras (ex.: "avaliação de botox").',
      },
    },
    required: ["data"],
  },
};

/** "AAAA-MM-DD" + n dias, contando a partir de hoje em Brasília. */
export function brasiliaDatePlus(days: number, now = new Date()) {
  const [y, m, d] = isoDateInBrasilia(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** O instante (UTC) em que sai a retomada de um dia "AAAA-MM-DD". */
export function followUpDueAt(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, SEND_HOUR_BRASILIA + 3)).toISOString();
}

/**
 * Confere uma data de retorno: "AAAA-MM-DD" válida, a partir de amanhã e no máximo
 * MAX_FOLLOW_UP_DAYS à frente. Devolve a data ou o motivo da recusa.
 */
export function checkFollowUpDate(
  value: unknown,
  now = new Date(),
): { date: string } | { error: string } {
  const text = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return { error: "Data em formato inválido; use AAAA-MM-DD." };
  const parsed = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (parsed.toISOString().slice(0, 10) !== text) {
    return { error: "Esta data não existe." };
  }
  if (text <= isoDateInBrasilia(now)) {
    return { error: "A data do retorno precisa ser a partir de amanhã." };
  }
  if (text > brasiliaDatePlus(MAX_FOLLOW_UP_DAYS, now)) {
    return { error: "A data do retorno está longe demais (mais de um ano)." };
  }
  return { date: text };
}

/**
 * Marca (ou remarca) a retomada pendente do contato: cada contato tem no máximo uma. Se já houver
 * uma, ela passa a valer a nova data.
 */
export async function setPendingFollowUp(
  admin: Admin,
  values: {
    clinicId: string;
    contactId: string;
    conversationId: number | null;
    date: string;
    source: "cliente" | "padrao" | "manual";
    reason: string;
    note?: string;
    attempt?: number;
    createdBy?: string | null;
  },
) {
  const fields = {
    due_at: followUpDueAt(values.date),
    source: values.source,
    reason: values.reason.replace(/\s+/g, " ").trim().slice(0, 120),
    note: (values.note ?? "").slice(0, 500),
    attempt: values.attempt ?? 1,
    conversation_id: values.conversationId,
    failures: 0,
    last_error: null,
  };
  for (let round = 0; round < 2; round++) {
    const { data: updated } = await admin
      .from("follow_ups")
      .update(fields)
      .eq("contact_id", values.contactId)
      .eq("status", "pendente")
      .select("id")
      .throwOnError();
    if (updated.length) return updated[0].id;

    const { data, error } = await admin
      .from("follow_ups")
      .insert({
        ...fields,
        clinic_id: values.clinicId,
        contact_id: values.contactId,
        created_by: values.createdBy ?? null,
      })
      .select("id")
      .single();
    if (!error) return data.id;
    // Outra pendente entrou ao mesmo tempo (um por contato): atualiza essa.
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Não foi possível registrar a retomada.");
}

/** Para a ferramenta da IA: "live" grava de verdade; "simulate" é a aba Testar. */
export type FollowUpMode =
  | {
      kind: "live";
      clinicId: string;
      contactId: string;
      conversationId: number;
    }
  | { kind: "simulate" }
  | null;

/** Executa "agendar_retorno". Nunca lança erro: devolve { erro } para a IA explicar. */
export async function callFollowUpTool(
  mode: NonNullable<FollowUpMode>,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const checked = checkFollowUpDate(args.data);
  if ("error" in checked) return { erro: checked.error };
  const reason = String(args.assunto ?? "");
  if (mode.kind === "simulate") {
    return {
      aviso:
        "Isto é uma simulação do modo de teste do painel. Em uma conversa real, a LumenzIA mandaria uma mensagem para a pessoa neste dia.",
      data: checked.date,
      assunto: reason,
    };
  }
  try {
    await setPendingFollowUp(createAdminClient(), {
      clinicId: mode.clinicId,
      contactId: mode.contactId,
      conversationId: mode.conversationId,
      date: checked.date,
      source: "cliente",
      reason,
    });
    return { ok: true, data: checked.date };
  } catch (e) {
    console.error("[retomada] registrar pela IA:", (e as Error).message);
    return {
      erro: "Não foi possível registrar o retorno agora. Diga que a equipe vai entrar em contato.",
    };
  }
}
