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

/**
 * Provedor de IA
 * --------------
 * O atendimento, a classificação e a análise mensal passam por aqui. AI_PROVIDER na Vercel
 * escolhe quem responde: "gemini" (padrão, com GEMINI_API_KEY) ou um provedor no formato da API
 * da OpenAI ("groq", "deepseek", "openrouter", "openai" ou "custom" com AI_BASE_URL), com
 * AI_API_KEY. AI_MODEL e AI_INSIGHTS_MODEL trocam o modelo desses provedores.
 */

/** Erro que pode ser mostrado como está para quem testa no painel. */
export class AiError extends Error {}

type Preset = {
  label: string;
  baseUrl: string;
  /** Modelo usado quando AI_MODEL não está definido (vazio = AI_MODEL obrigatório). */
  model: string;
  /** Campos extras que o provedor aceita (ex.: raciocínio curto). */
  extra?: Record<string, unknown>;
  /** A OpenAI só aceita max_completion_tokens nos modelos novos. */
  maxTokensField?: "max_tokens" | "max_completion_tokens";
};

const PRESETS = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    extra: { reasoning_effort: "low" },
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    maxTokensField: "max_completion_tokens",
  },
  custom: { label: "provedor de IA", baseUrl: "", model: "" },
} satisfies Record<string, Preset>;

type CompatName = keyof typeof PRESETS;
export type ProviderName = "gemini" | CompatName;

const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

const env = (name: string) => process.env[name]?.trim() || "";

export function aiProvider(): ProviderName {
  const name = env("AI_PROVIDER").toLowerCase();
  return name in PRESETS ? (name as CompatName) : "gemini";
}

/** Nome para mostrar (painel do admin, política de privacidade). */
export function aiProviderLabel(name = aiProvider()) {
  return name === "gemini" ? "Google (Gemini)" : PRESETS[name].label;
}

/** A chave do provedor escolhido está na Vercel? */
export function aiConfigured() {
  return aiProvider() === "gemini"
    ? !!env("GEMINI_API_KEY")
    : !!compatConfig("chat");
}

export type ModelUse = "chat" | "insights";

export function aiModel(use: ModelUse = "chat") {
  const provider = aiProvider();
  if (provider === "gemini") {
    return (
      (use === "insights" && env("GEMINI_INSIGHTS_MODEL")) ||
      env("GEMINI_MODEL") ||
      GEMINI_DEFAULT_MODEL
    );
  }
  return (
    (use === "insights" && env("AI_INSIGHTS_MODEL")) ||
    env("AI_MODEL") ||
    PRESETS[provider].model
  );
}

// ---------------------------------------------------------------------------------------------
// Conversa neutra: o motor monta isto e cada provedor traduz para o seu formato.

export type ToolDeclaration = FunctionDeclaration;
export type LlmCall = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
};
export type LlmMessage =
  | { role: "user"; text: string }
  /** `native` guarda a resposta original do provedor (o Gemini 3 exige devolver as assinaturas). */
  | { role: "model"; text?: string; calls?: LlmCall[]; native?: unknown }
  | {
      role: "tool";
      results: { id?: string; name: string; response: object }[];
    };

export type ChatRequest = {
  system: string;
  messages: LlmMessage[];
  tools: ToolDeclaration[];
  temperature: number;
  maxTokens: number;
};

export type ChatResult = {
  text: string;
  calls: LlmCall[];
  /** Para repetir a resposta no histórico da próxima rodada. */
  message: LlmMessage;
};

export type JsonRequest = {
  prompt: string;
  schema: Record<string, unknown>;
  temperature: number;
  maxTokens: number;
  use: ModelUse;
  timeoutMs?: number;
  /** Para o log: "classificação", "análise". */
  label: string;
  /** Mensagem de erro para quem usa. */
  failure: string;
};

/** Uma rodada de conversa: texto final ou chamadas de ferramenta. */
export function chat(request: ChatRequest): Promise<ChatResult> {
  return aiProvider() === "gemini" ? geminiChat(request) : compatChat(request);
}

/** Resposta em JSON (texto), no formato de `schema`. */
export function generateJson(request: JsonRequest): Promise<string> {
  return aiProvider() === "gemini" ? geminiJson(request) : compatJson(request);
}

// ---------------------------------------------------------------------------------------------
// Gemini

let geminiClient: GoogleGenAI | null = null;
function gemini() {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) {
    throw new AiError(
      "A chave do Gemini ainda não foi configurada no servidor (GEMINI_API_KEY).",
    );
  }
  geminiClient ??= new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 30_000,
      // tenta de novo sozinho em sobrecarga temporária (408, 429 e 5xx)
      retryOptions: { attempts: 3, initialDelay: 0.8, maxDelay: 4 },
    },
  });
  return geminiClient;
}

/**
 * No atendimento, raciocínio interno no mínimo: cada token de raciocínio sai do orçamento da
 * resposta. Na análise mensal, mais raciocínio. A série 2.5 usa um orçamento em tokens; da 3 em
 * diante, um nível.
 */
function thinkingConfig(
  model: string,
  use: ModelUse,
): GenerateContentConfig["thinkingConfig"] {
  if (use === "insights") {
    if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 2048 };
    if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 4096 };
    return {};
  }
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 128 };
  return { thinkingLevel: ThinkingLevel.LOW };
}

function toGeminiContents(messages: LlmMessage[]): Content[] {
  return messages.map((m): Content => {
    if (m.role === "user") return { role: "user", parts: [{ text: m.text }] };
    if (m.role === "tool") {
      // O resultado da função volta com o papel "user".
      return {
        role: "user",
        parts: m.results.map((r) => ({
          functionResponse: {
            id: r.id,
            name: r.name,
            response: r.response as Record<string, unknown>,
          },
        })),
      };
    }
    if (m.native) return { role: "model", parts: m.native as Part[] };
    return {
      role: "model",
      parts: [
        ...(m.text ? [{ text: m.text }] : []),
        ...(m.calls ?? []).map((c) => ({
          functionCall: { id: c.id, name: c.name, args: c.args },
        })),
      ],
    };
  });
}

function geminiFailure(e: unknown, label: string, message: string) {
  if (e instanceof AiError) return e;
  const status = e instanceof ApiError ? e.status : "rede";
  console.error(
    `[gemini] ${label} ${status}:`,
    (e as Error).message.slice(0, 300),
  );
  return new AiError(message);
}

async function geminiChat(request: ChatRequest): Promise<ChatResult> {
  const model = aiModel("chat");
  try {
    const response = await gemini().models.generateContent({
      model,
      contents: toGeminiContents(request.messages),
      config: {
        systemInstruction: request.system,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        thinkingConfig: thinkingConfig(model, "chat"),
        tools: request.tools.length
          ? [{ functionDeclarations: request.tools }]
          : undefined,
      },
    });
    const usage = response.usageMetadata;
    console.log(
      `[gemini] ${model}: entrada=${usage?.promptTokenCount ?? 0} (${usage?.cachedContentTokenCount ?? 0} em cache), saída=${usage?.candidatesTokenCount ?? 0}`,
    );
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const calls = parts
      .filter((p) => p.functionCall)
      .map(({ functionCall }) => ({
        id: functionCall!.id,
        name: functionCall!.name ?? "",
        args: { ...(functionCall!.args ?? {}) },
      }));
    const text = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();
    return {
      text,
      calls,
      message: { role: "model", text, calls, native: parts },
    };
  } catch (e) {
    throw geminiFailure(
      e,
      "atendimento",
      "Não foi possível gerar a resposta agora. Tente novamente em instantes.",
    );
  }
}

async function geminiJson(request: JsonRequest): Promise<string> {
  const model = aiModel(request.use);
  try {
    const response = await gemini().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      config: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        thinkingConfig: thinkingConfig(model, request.use),
        responseMimeType: "application/json",
        responseJsonSchema: request.schema,
        ...(request.timeoutMs
          ? { httpOptions: { timeout: request.timeoutMs } }
          : {}),
      },
    });
    const usage = response.usageMetadata;
    console.log(
      `[gemini] ${request.label} ${model}: entrada=${usage?.promptTokenCount ?? 0}, saída=${usage?.candidatesTokenCount ?? 0}, raciocínio=${usage?.thoughtsTokenCount ?? 0}`,
    );
    return response.text ?? "";
  } catch (e) {
    throw geminiFailure(e, request.label, request.failure);
  }
}

// ---------------------------------------------------------------------------------------------
// Provedores no formato da OpenAI (Chat Completions)

type CompatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type CompatResponse = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function compatPreset(): Preset {
  return PRESETS[aiProvider() as CompatName];
}

/** Chave, endereço e modelo do provedor; null se falta algum. */
function compatConfig(use: ModelUse) {
  const preset = compatPreset();
  const apiKey = env("AI_API_KEY");
  const baseUrl = (env("AI_BASE_URL") || preset.baseUrl).replace(/\/+$/, "");
  const model = aiModel(use);
  return apiKey && baseUrl && model ? { preset, apiKey, baseUrl, model } : null;
}

/** Ids dados por nós quando o provedor não manda (alguns modelos abertos). */
const callId = (round: number, i: number) => `call_${round}_${i}`;

function toCompatMessages(system: string, messages: LlmMessage[]) {
  const out: CompatMessage[] = [{ role: "system", content: system }];
  messages.forEach((m, round) => {
    if (m.role === "user") out.push({ role: "user", content: m.text });
    else if (m.role === "model") {
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(m.calls?.length
          ? {
              tool_calls: m.calls.map((c, i) => ({
                id: c.id || callId(round, i),
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
    } else {
      // As respostas casam com as chamadas da mensagem anterior pela posição.
      const previous = messages[round - 1];
      const calls = previous?.role === "model" ? (previous.calls ?? []) : [];
      m.results.forEach((r, i) =>
        out.push({
          role: "tool",
          tool_call_id: r.id || calls[i]?.id || callId(round - 1, i),
          content: JSON.stringify(r.response),
        }),
      );
    }
  });
  return out;
}

const retryable = (status: number) =>
  status === 408 || status === 429 || status >= 500;

async function compatRequest(
  use: ModelUse,
  body: Record<string, unknown>,
  maxTokens: number,
  timeoutMs: number,
  label: string,
  failure: string,
): Promise<CompatResponse> {
  const cfg = compatConfig(use);
  if (!cfg) {
    throw new AiError(
      `A IA (${compatPreset().label}) ainda não foi configurada no servidor (AI_API_KEY, AI_MODEL ou AI_BASE_URL).`,
    );
  }
  const payload = JSON.stringify({
    ...cfg.preset.extra,
    ...body,
    model: cfg.model,
    // Modelos com raciocínio gastam parte do limite pensando; só o que é usado é cobrado.
    [cfg.preset.maxTokensField ?? "max_tokens"]: Math.max(maxTokens, 2048),
  });
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    try {
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const data = (await response.json()) as CompatResponse;
        console.log(
          `[ia] ${cfg.preset.label} ${label} ${cfg.model}: entrada=${data.usage?.prompt_tokens ?? 0}, saída=${data.usage?.completion_tokens ?? 0}`,
        );
        return data;
      }
      lastError = `${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`;
      if (!retryable(response.status)) break;
    } catch (e) {
      lastError = `rede: ${(e as Error).message}`;
    }
  }
  console.error(`[ia] ${cfg.preset.label} ${label} ${lastError}`);
  throw new AiError(failure);
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

async function compatChat(request: ChatRequest): Promise<ChatResult> {
  const data = await compatRequest(
    "chat",
    {
      messages: toCompatMessages(request.system, request.messages),
      temperature: request.temperature,
      ...(request.tools.length
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parametersJsonSchema ?? {
                  type: "object",
                  properties: {},
                },
              },
            })),
          }
        : {}),
    },
    request.maxTokens,
    30_000,
    "atendimento",
    "Não foi possível gerar a resposta agora. Tente novamente em instantes.",
  );
  const message = data.choices?.[0]?.message;
  const calls = (message?.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function?.name ?? "",
    args: parseArgs(c.function?.arguments),
  }));
  const text = (message?.content ?? "").trim();
  return { text, calls, message: { role: "model", text, calls } };
}

async function compatJson(request: JsonRequest): Promise<string> {
  // "json_object" é o modo que todos aceitam; o formato vai junto no pedido.
  const prompt = [
    request.prompt,
    "",
    "Responda somente com um objeto JSON (sem texto antes ou depois) que siga este JSON Schema:",
    JSON.stringify(request.schema),
  ].join("\n");
  const data = await compatRequest(
    request.use,
    {
      messages: [{ role: "user", content: prompt }],
      temperature: request.temperature,
      response_format: { type: "json_object" },
    },
    request.maxTokens,
    request.timeoutMs ?? 30_000,
    request.label,
    request.failure,
  );
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
