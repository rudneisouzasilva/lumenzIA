import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseBookingFields,
  parsePatientData,
  type BookingFields,
  type PatientData,
} from "@/lib/booking-fields";
import { normalizePhone } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import {
  agendaTools,
  callAgenda,
  simulateAgenda,
  type AgendaResult,
  type Integration,
} from "./agenda";
import {
  callFollowUpTool,
  FOLLOW_UP_TOOL,
  type FollowUpMode,
} from "./follow-up";
import { checkEvaluation } from "./evaluation";
import { knownFieldNames, preparePatientData } from "./patient-data";
import { buildSystemPrompt, parseReply, type AssistantContext } from "./prompt";
import {
  AiError,
  chat,
  generateJson,
  type LlmMessage,
  type ToolDeclaration,
} from "./provider";

export { AiError };

const MAX_TOOL_ROUNDS = 4;

export type ChatTurn = { role: "user" | "model"; text: string };

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: AgendaResult;
};

export type { FollowUpMode };

/**
 * Agenda: "live" chama o sistema da clínica, "simulate" só mostra o que seria enviado (aba
 * Testar), null desliga as ferramentas.
 */
export type AgendaMode =
  | {
      kind: "live";
      integration: Integration;
      contactPhone: string;
      /** O contato desta conversa, para reaproveitar os dados que a pessoa já informou. */
      contactId: string | null;
      conversationId: number;
    }
  | { kind: "simulate" }
  | null;

/** Tudo o que a IA precisa saber da clínica, lido pelo cliente informado (RLS ou chave secreta). */
export async function loadAssistantContext(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<AssistantContext & { integration: Integration | null }> {
  const [
    clinic,
    faqs,
    questions,
    images,
    services,
    professionals,
    integration,
  ] = await Promise.all([
    supabase
      .from("clinics")
      .select(
        "name, assistant_name, tone, business_info, past_conversations, behavior_rules, work_days, work_hours_start, work_hours_end, works_on_holidays, extra_closed_dates, require_evaluation, evaluation_validity_days, booking_fields",
      )
      .eq("id", clinicId)
      .single()
      .throwOnError(),
    supabase
      .from("faqs")
      .select("question, answer")
      .eq("clinic_id", clinicId)
      .order("sort_order")
      .order("id")
      .throwOnError(),
    supabase
      .from("ai_questions")
      .select("question")
      .eq("clinic_id", clinicId)
      .order("sort_order")
      .order("id")
      .throwOnError(),
    supabase
      .from("images")
      .select("id, storage_path, description")
      .eq("clinic_id", clinicId)
      .order("created_at")
      .order("id")
      .throwOnError(),
    supabase
      .from("services")
      .select("name, duration_minutes, kind")
      .eq("clinic_id", clinicId)
      .order("sort_order")
      .order("id")
      .throwOnError(),
    supabase
      .from("professionals")
      .select("name")
      .eq("clinic_id", clinicId)
      .order("sort_order")
      .order("id")
      .throwOnError(),
    supabase
      .from("integrations")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle()
      .throwOnError(),
  ]);

  return {
    clinic: clinic.data,
    faqs: faqs.data,
    questions: questions.data,
    images: images.data,
    services: services.data,
    professionals: professionals.data,
    integration: integration.data,
  };
}

/**
 * Com a avaliação obrigatória, barra a consulta de horários e o agendamento de um procedimento
 * para quem ainda não tem avaliação válida, antes de chegar à agenda da clínica.
 */
async function evaluationBlock(
  clinicId: string,
  context: AssistantContext,
  action: string,
  args: Record<string, unknown>,
): Promise<AgendaResult | null> {
  if (action !== "criar_agendamento" && action !== "consultar_disponibilidade")
    return null;
  try {
    return await checkEvaluation(
      createAdminClient(),
      clinicId,
      context.clinic,
      context.services,
      args,
    );
  } catch (e) {
    console.error("[avaliação] conferência:", (e as Error).message);
    return {
      erro: "Não foi possível confirmar a avaliação desta pessoa agora. Peça para aguardar que a equipe confirma.",
    };
  }
}

/** O que a própria pessoa já informou em agendamentos anteriores (vazio se não der para ler). */
async function loadKnownPatientData(contactId: string | null) {
  if (!contactId) return {};
  const { data, error } = await createAdminClient()
    .from("contacts")
    .select("patient_data")
    .eq("id", contactId)
    .maybeSingle();
  if (error) console.error("[agenda] dados do contato:", error.message);
  return parsePatientData(data?.patient_data);
}

const samePhone = (a: unknown, b: string) =>
  normalizePhone(String(a ?? "")) === normalizePhone(b);

/**
 * Para "criar_agendamento": confere e completa os dados da pessoa. Os já conhecidos só valem
 * quando o agendamento é para quem está conversando, não para outra pessoa.
 */
function patientDataBlock(
  fields: BookingFields,
  known: PatientData,
  agenda: Exclude<AgendaMode, null>,
  action: string,
  args: Record<string, unknown>,
) {
  if (action !== "criar_agendamento") return null;
  const own =
    agenda.kind !== "live" || samePhone(args.telefone, agenda.contactPhone);
  return preparePatientData(fields, args, own ? known : {});
}

/**
 * Gera a resposta da assistente. `history` termina com a mensagem do paciente. Resolve as
 * chamadas de ferramenta (agenda e retorno combinado, até 4 rodadas) antes do texto final.
 * `previousSummaries` são os resumos das últimas conversas com a mesma pessoa.
 */
export async function generateReply({
  context,
  history,
  agenda,
  followUp = null,
  sentImageIds = [],
  previousSummaries = [],
}: {
  context: AssistantContext;
  history: ChatTurn[];
  agenda: AgendaMode;
  followUp?: FollowUpMode;
  sentImageIds?: string[];
  previousSummaries?: string[];
}) {
  const fields = parseBookingFields(context.clinic.booking_fields);
  const known =
    agenda?.kind === "live" ? await loadKnownPatientData(agenda.contactId) : {};
  const system = buildSystemPrompt(context, {
    agendaEnabled: agenda !== null,
    knownPatientFields: knownFieldNames(fields, known),
    followUpEnabled: followUp !== null,
    sentImageIds,
    previousSummaries,
  });
  const tools: ToolDeclaration[] = [
    ...(agenda ? agendaTools(fields) : []),
    ...(followUp ? [FOLLOW_UP_TOOL] : []),
  ];
  const messages: LlmMessage[] = history
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, text: m.text }));
  if (!messages.some((m) => m.role === "user"))
    throw new AiError("Mensagem vazia.");

  const toolCalls: ToolCall[] = [];
  let raw = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chat({
      system,
      messages,
      tools,
      temperature: 0.6,
      maxTokens: 1024,
    });
    if (!response.calls.length || !tools.length) {
      raw = response.text;
      break;
    }

    messages.push(response.message);
    const results: { id?: string; name: string; response: AgendaResult }[] = [];
    for (const call of response.calls) {
      const name = call.name;
      const args = { ...call.args };
      let result: AgendaResult;
      if (name === FOLLOW_UP_TOOL.name) {
        result = followUp
          ? await callFollowUpTool(followUp, args)
          : { erro: "Ferramenta indisponível." };
      } else if (!agenda) {
        result = { erro: "A agenda não está conectada nesta clínica." };
      } else if (agenda.kind === "live") {
        // Consultar e cancelar valem só para o próprio contato, seja qual for o número pedido.
        if (
          !args.telefone ||
          name === "consultar_agendamentos" ||
          name === "cancelar_agendamento"
        ) {
          args.telefone = agenda.contactPhone;
        }
        result =
          patientDataBlock(fields, known, agenda, name, args) ??
          (await evaluationBlock(
            agenda.integration.clinic_id,
            context,
            name,
            args,
          )) ??
          (await callAgenda(
            agenda.integration,
            context.services,
            name,
            args,
            agenda.conversationId,
          ));
      } else {
        result =
          patientDataBlock(fields, known, agenda, name, args) ??
          simulateAgenda(name, args);
      }
      toolCalls.push({ name, args, result });
      results.push({ id: call.id, name, response: result });
    }
    messages.push({ role: "tool", results });
  }

  if (!raw) {
    throw new AiError(
      "A IA não conseguiu concluir a resposta. Tente novamente.",
    );
  }
  return { ...parseReply(raw, context.images), toolCalls };
}

export type Classification = {
  reason: string | null;
  status: "concluida" | "abandonada";
  summary: string;
  /** Dia que a própria pessoa pediu para ser procurada de novo (AAAA-MM-DD), se pediu. */
  followUpDate: string | null;
  /** O interesse principal, em poucas palavras ("avaliação de botox"). */
  topic: string;
};

/**
 * Classifica uma conversa encerrada: o motivo do contato (um dos cadastrados pela clínica, ou
 * null) e se ela foi concluída ou abandonada, com um resumo curto. Usado ao encerrar conversas,
 * nunca durante o atendimento.
 */
export async function classifyConversation({
  reasons,
  messages,
  today,
}: {
  reasons: { name: string; description: string }[];
  messages: { role: "user" | "model" | "staff"; content: string }[];
  /** Hoje em Brasília (AAAA-MM-DD), para entender "semana que vem". */
  today: string;
}): Promise<Classification> {
  const who = { user: "Paciente", model: "Assistente", staff: "Equipe" };
  const transcript = messages
    .map((m) => `${who[m.role]}: ${m.content}`)
    .join("\n")
    .slice(-12_000); // conversas muito longas: o final é o que decide o desfecho
  const reasonList = reasons.length
    ? reasons
        .map((r) => `- "${r.name}": ${r.description || "sem descrição"}`)
        .join("\n")
    : null;

  const prompt = [
    "Você analisa uma conversa encerrada entre uma clínica de estética e um paciente pelo WhatsApp.",
    "",
    "Definições de status:",
    '- "concluida": a dúvida foi respondida, um agendamento foi encaminhado ou confirmado, ou a conversa chegou a um fim natural.',
    '- "abandonada": o paciente parou de responder no meio, pediu atendimento humano sem resolução, ou a clínica não conseguiu ajudar.',
    "",
    reasonList
      ? `Motivos de contato possíveis (escolha o que melhor descreve, com o nome exato, ou null se nenhum combinar):\n${reasonList}`
      : "Não há motivos cadastrados: use null em motivo.",
    "",
    "O resumo tem até 20 palavras, em português.",
    "",
    `Hoje é ${today}. Em "retorno", se o paciente pediu para a clínica procurá-lo de novo mais tarde ("me chama mês que vem", "depois do dia 10 eu vejo"), informe o dia no formato AAAA-MM-DD (para um período, o primeiro dia útil dele); senão, null.`,
    'Em "assunto", o interesse principal do paciente em até 6 palavras (ex.: "avaliação de botox"), ou "" se não houver.',
    "",
    "Conversa:",
    transcript,
  ].join("\n");

  const text = await generateJson({
    prompt,
    temperature: 0,
    maxTokens: 320,
    use: "chat",
    label: "classificação",
    failure: "Não foi possível classificar a conversa agora.",
    schema: {
      type: "object",
      properties: {
        motivo: { type: ["string", "null"] },
        status: { type: "string", enum: ["concluida", "abandonada"] },
        resumo: { type: "string" },
        retorno: { type: ["string", "null"] },
        assunto: { type: "string" },
      },
      required: ["motivo", "status", "resumo", "retorno", "assunto"],
    },
  });

  let parsed: {
    motivo?: unknown;
    status?: unknown;
    resumo?: unknown;
    retorno?: unknown;
    assunto?: unknown;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("A classificação veio num formato inesperado.");
  }
  if (parsed.status !== "concluida" && parsed.status !== "abandonada") {
    throw new AiError("A classificação veio num formato inesperado.");
  }
  const wanted = String(parsed.motivo ?? "")
    .trim()
    .toLowerCase();
  const reason =
    reasons.find((r) => r.name.trim().toLowerCase() === wanted)?.name ?? null;
  return {
    reason,
    status: parsed.status,
    summary: String(parsed.resumo ?? "").slice(0, 500),
    followUpDate:
      typeof parsed.retorno === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.retorno)
        ? parsed.retorno
        : null,
    topic: String(parsed.assunto ?? "")
      .trim()
      .slice(0, 80),
  };
}
