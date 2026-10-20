import "server-only";

import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  AGENDA_TOOLS,
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
import { buildSystemPrompt, parseReply, type AssistantContext } from "./prompt";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_TOOL_ROUNDS = 4;

/** Erro que pode ser mostrado como está para quem testa no painel. */
export class AiError extends Error {}

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
        "name, assistant_name, tone, business_info, past_conversations, behavior_rules, work_days, work_hours_start, work_hours_end, works_on_holidays, extra_closed_dates",
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
      .select("name, duration_minutes")
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

function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

let client: GoogleGenAI | null = null;
function gemini() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiError(
      "A chave do Gemini ainda não foi configurada no servidor (GEMINI_API_KEY).",
    );
  }
  client ??= new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 30_000,
      // tenta de novo sozinho em sobrecarga temporária (408, 429 e 5xx)
      retryOptions: { attempts: 3, initialDelay: 0.8, maxDelay: 4 },
    },
  });
  return client;
}

/**
 * Raciocínio interno no mínimo: é um chat de atendimento e cada token de raciocínio sai do
 * orçamento da resposta. A série 2.5 usa um orçamento em tokens; da 3 em diante, um nível.
 */
function thinkingConfig(
  model: string,
): GenerateContentConfig["thinkingConfig"] {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 128 };
  return { thinkingLevel: ThinkingLevel.LOW };
}

async function generate(
  contents: Content[],
  systemInstruction: string,
  tools: FunctionDeclaration[],
) {
  const model = geminiModel();
  try {
    const response = await gemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.6,
        maxOutputTokens: 1024,
        thinkingConfig: thinkingConfig(model),
        tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
      },
    });
    const usage = response.usageMetadata;
    console.log(
      `[gemini] ${model}: entrada=${usage?.promptTokenCount ?? 0} (${usage?.cachedContentTokenCount ?? 0} em cache), saída=${usage?.candidatesTokenCount ?? 0}`,
    );
    return response;
  } catch (e) {
    if (e instanceof AiError) throw e;
    const status = e instanceof ApiError ? e.status : "rede";
    console.error(`[gemini] ${status}:`, (e as Error).message.slice(0, 300));
    throw new AiError(
      "Não foi possível gerar a resposta agora. Tente novamente em instantes.",
    );
  }
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
  const system = buildSystemPrompt(context, {
    agendaEnabled: agenda !== null,
    followUpEnabled: followUp !== null,
    sentImageIds,
    previousSummaries,
  });
  const tools: FunctionDeclaration[] = [
    ...(agenda ? AGENDA_TOOLS : []),
    ...(followUp ? [FOLLOW_UP_TOOL] : []),
  ];
  const contents: Content[] = history
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  if (!contents.some((c) => c.role === "user"))
    throw new AiError("Mensagem vazia.");

  const toolCalls: ToolCall[] = [];
  let raw = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await generate(contents, system, tools);
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length || !tools.length) {
      raw = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      break;
    }

    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    for (const { functionCall } of calls) {
      const name = functionCall!.name ?? "";
      const args = { ...(functionCall!.args ?? {}) };
      let result: AgendaResult;
      if (name === FOLLOW_UP_TOOL.name) {
        result = followUp
          ? await callFollowUpTool(followUp, args)
          : { erro: "Ferramenta indisponível." };
      } else if (!agenda) {
        result = { erro: "A agenda não está conectada nesta clínica." };
      } else if (agenda.kind === "live") {
        if (!args.telefone) args.telefone = agenda.contactPhone;
        result = await callAgenda(
          agenda.integration,
          context.services,
          name,
          args,
          agenda.conversationId,
        );
      } else {
        result = simulateAgenda(name, args);
      }
      toolCalls.push({ name, args, result });
      responses.push({
        functionResponse: { id: functionCall!.id, name, response: result },
      });
    }
    // O resultado da função volta com o papel "user".
    contents.push({ role: "user", parts: responses });
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

  const model = geminiModel();
  let text: string;
  try {
    const response = await gemini().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0,
        maxOutputTokens: 320,
        thinkingConfig: thinkingConfig(model),
        responseMimeType: "application/json",
        responseJsonSchema: {
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
      },
    });
    text = response.text ?? "";
  } catch (e) {
    if (e instanceof AiError) throw e;
    const status = e instanceof ApiError ? e.status : "rede";
    console.error(`[gemini] classificação ${status}:`, (e as Error).message);
    throw new AiError("Não foi possível classificar a conversa agora.");
  }

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
