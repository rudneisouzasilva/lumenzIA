import "server-only";

import { createSign } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Conexão com a agenda da clínica
 * -------------------------------
 * A maioria dos sistemas de clínica de estética não tem API pública, então há dois modos,
 * configurados pela equipe LumenzIA:
 *
 *  - "webhook" (padrão): um POST em JSON { action, ...parametros } para UM endereço, normalmente um
 *    fluxo no Zapier, Make ou n8n que traduz para o sistema da clínica.
 *  - "custom": quando o sistema TEM API, cada ação descreve método, URL, cabeçalhos e corpo, com
 *    {{parametro}} e {{apiKey}} no lugar dos valores. A chave pode ser o JSON de uma conta de
 *    serviço do Google (com um campo extra "calendarId"): trocamos por um token sozinhos.
 *
 * Nos dois modos a resposta é um JSON simples, repassado para a IA interpretar.
 */

export type Integration = Database["public"]["Tables"]["integrations"]["Row"];
export type AgendaResult = Record<string, unknown>;

type ActionConfig = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
};

const ACTIONS = [
  "consultar_disponibilidade",
  "criar_agendamento",
  "consultar_agendamentos",
  "cancelar_agendamento",
  "listar_agendamentos",
] as const;
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARS = 4000;
const MAX_BODY_CHARS = 4000;
const DEFAULT_DURATION_MINUTES = 60; // procedimento que não bate com nenhum cadastrado

/** As ações que a IA pode chamar, em JSON Schema (o Gemini aceita direto). */
export const AGENDA_TOOLS = [
  {
    name: "consultar_disponibilidade",
    description:
      "Consulta os horários livres na agenda da clínica para um procedimento e período.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        procedimento: {
          type: "string",
          description: "Nome do procedimento de interesse.",
        },
        profissional: {
          type: "string",
          description:
            "Nome exato de um dos profissionais cadastrados, quando a clínica tiver mais de um. Omita se houver só um profissional ou nenhum cadastrado.",
        },
        data_inicio: {
          type: "string",
          description: "Data inicial da busca, formato AAAA-MM-DD.",
        },
        data_fim: {
          type: "string",
          description: "Data final da busca, formato AAAA-MM-DD.",
        },
      },
      required: ["data_inicio"],
    },
  },
  {
    name: "criar_agendamento",
    description:
      "Cria um agendamento na agenda da clínica. Só use depois de confirmar com a pessoa nome, procedimento, data e horário. A duração é calculada automaticamente a partir do procedimento cadastrado, não precisa perguntar.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        nome_paciente: { type: "string" },
        telefone: { type: "string" },
        procedimento: {
          type: "string",
          description:
            "Use exatamente o nome de um dos procedimentos cadastrados, quando houver um que combine.",
        },
        profissional: {
          type: "string",
          description:
            "Nome exato de um dos profissionais cadastrados, quando a clínica tiver mais de um. Omita se houver só um profissional ou nenhum cadastrado.",
        },
        data_hora: {
          type: "string",
          description: "Formato AAAA-MM-DDTHH:mm (horário de início).",
        },
        observacoes: { type: "string" },
      },
      required: ["nome_paciente", "procedimento", "data_hora"],
    },
  },
  {
    name: "consultar_agendamentos",
    description: "Consulta os agendamentos já marcados para este contato.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        telefone: { type: "string" },
        profissional: {
          type: "string",
          description:
            "Nome exato de um dos profissionais cadastrados, se a pessoa quiser filtrar por um específico. Omita para consultar todos.",
        },
      },
    },
  },
  {
    name: "cancelar_agendamento",
    description:
      "Cancela um agendamento existente. Só use depois que a pessoa confirmar qual agendamento cancelar.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        agendamento_id: { type: "string" },
        telefone: { type: "string" },
        profissional: {
          type: "string",
          description:
            "Nome exato do profissional com quem o agendamento foi marcado, se relevante para localizá-lo.",
        },
      },
      required: ["agendamento_id"],
    },
  },
];

/** Usado na aba Testar: nunca chama a agenda de verdade, só mostra o que seria enviado. */
export function simulateAgenda(
  action: string,
  params: Record<string, unknown>,
): AgendaResult {
  return {
    aviso:
      "Isto é uma simulação do modo de teste do painel. Em uma conversa real, esta ação chamaria o sistema de agenda da clínica.",
    acao_recebida: action,
    parametros_recebidos: params,
  };
}

/** Troca {{chave}} pelo valor correspondente (vazio se não existir). */
function interpolate(str: string, vars: Record<string, unknown>) {
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * "AAAA-MM-DDTHH:mm" no horário de Brasília (-03:00, sem horário de verão) para um Date UTC, sem
 * depender do fuso do servidor.
 */
export function brasiliaToUtc(dataHora: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(
    String(dataHora ?? ""),
  );
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi));
}

/** O mesmo horário de volta para "AAAA-MM-DDTHH:mm" em Brasília. */
function utcToBrasilia(date: Date) {
  return new Date(date.getTime() - 3 * 3600_000).toISOString().slice(0, 16);
}

function durationFor(
  services: { name: string; duration_minutes: number }[],
  procedimento: unknown,
) {
  const name = String(procedimento ?? "")
    .trim()
    .toLowerCase();
  return (
    services.find((s) => s.name.trim().toLowerCase() === name)
      ?.duration_minutes ?? DEFAULT_DURATION_MINUTES
  );
}

/** Para "criar_agendamento": fim e duração calculados a partir do procedimento cadastrado. */
function extraVars(
  action: string,
  params: Record<string, unknown>,
  services: { name: string; duration_minutes: number }[],
) {
  if (action !== "criar_agendamento") return {};
  const start = brasiliaToUtc(params.data_hora);
  if (!start) return {};
  const minutes = durationFor(services, params.procedimento);
  return {
    data_hora_fim: utcToBrasilia(new Date(start.getTime() + minutes * 60_000)),
    duracao_minutos: minutes,
  };
}

async function readJson(res: Response): Promise<AgendaResult> {
  const text = (await res.text()).slice(0, MAX_RESPONSE_CHARS);
  if (!res.ok) {
    return {
      erro: `O sistema de agenda respondeu com erro (${res.status}).`,
      detalhe: text.slice(0, 300),
    };
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed)
      ? { agendamentos: parsed }
      : parsed && typeof parsed === "object"
        ? (parsed as AgendaResult)
        : { resultado: parsed };
  } catch {
    return {
      erro: "O sistema de agenda respondeu em um formato inesperado (não é JSON).",
    };
  }
}

// --- Google Calendar por conta de serviço --------------------------------------------------

type ServiceAccount = {
  client_email: string;
  private_key: string;
  calendarId?: string;
};

function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return obj?.type === "service_account" &&
      typeof obj.client_email === "string" &&
      typeof obj.private_key === "string"
      ? (obj as unknown as ServiceAccount)
      : null;
  } catch {
    return null;
  }
}

const googleTokens = new Map<string, { token: string; expiresAt: number }>();

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

async function googleAccessToken(clinicId: string, sa: ServiceAccount) {
  const cached = googleTokens.get(clinicId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `o Google recusou a conta de serviço (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  googleTokens.set(clinicId, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

// --- Chamada à agenda -----------------------------------------------------------------------

async function callWebhook(
  integration: Integration,
  apiKey: string,
  action: string,
  vars: Record<string, unknown>,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(integration.webhook_url!, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...vars }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return readJson(res);
}

async function callCustomApi(
  integration: Integration,
  rawKey: string,
  action: string,
  params: Record<string, unknown>,
) {
  const config = integration.actions_config as Record<
    string,
    ActionConfig
  > | null;
  const cfg = config?.[action];
  if (!cfg?.url) {
    return {
      erro: `A ação "${action}" ainda não foi configurada para esta clínica.`,
    };
  }

  let apiKey = rawKey;
  let calendarId = "primary";
  const sa = rawKey ? parseServiceAccount(rawKey) : null;
  if (sa) {
    calendarId = sa.calendarId || calendarId;
    try {
      apiKey = await googleAccessToken(integration.clinic_id, sa);
    } catch (e) {
      console.error(
        "[agenda] conta de serviço do Google:",
        (e as Error).message,
      );
      return {
        erro: "Não foi possível autenticar com a conta de serviço do Google.",
      };
    }
  }

  const vars = { ...params, apiKey, calendarId };
  const method = (cfg.method || "GET").toUpperCase();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    headers[k] = interpolate(String(v), vars);
  }
  let body: string | undefined;
  if (cfg.body && method !== "GET" && method !== "HEAD") {
    body = interpolate(cfg.body, vars).slice(0, MAX_BODY_CHARS);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "application/json";
    }
  }
  const res = await fetch(interpolate(cfg.url, vars), {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return readJson(res);
}

/** Guarda uma cópia local do que foi marcado ou cancelado (lembretes e lista no painel). */
async function mirrorAppointment(
  clinicId: string,
  action: string,
  params: Record<string, unknown>,
  extra: { duracao_minutos?: number },
  result: AgendaResult,
) {
  if (result.erro) return;
  const admin = createAdminClient();
  const text = (v: unknown) => (v == null ? "" : String(v));

  if (action === "criar_agendamento") {
    const startsAt = brasiliaToUtc(params.data_hora);
    if (!startsAt) return;
    const minutes = extra.duracao_minutos ?? DEFAULT_DURATION_MINUTES;
    const ref = result.id ?? result.eventId;
    await admin
      .from("appointments")
      .insert({
        clinic_id: clinicId,
        contact_phone: text(params.telefone),
        patient_name: text(params.nome_paciente),
        procedure_name: text(params.procedimento),
        professional_name: text(params.profissional),
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
        external_ref: ref == null ? null : String(ref),
      })
      .throwOnError();
  }

  if (action === "cancelar_agendamento") {
    if (params.agendamento_id) {
      await admin
        .from("appointments")
        .update({ status: "cancelado" })
        .eq("clinic_id", clinicId)
        .eq("external_ref", String(params.agendamento_id))
        .eq("status", "agendado")
        .throwOnError();
    } else if (params.telefone) {
      // Sem o id, cancela o próximo agendamento em aberto deste contato (e deste profissional,
      // quando informado), para não cancelar o compromisso errado.
      let next = admin
        .from("appointments")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("contact_phone", String(params.telefone))
        .eq("status", "agendado")
        .gt("starts_at", new Date().toISOString());
      if (params.profissional) {
        next = next.eq("professional_name", String(params.profissional));
      }
      const { data } = await next
        .order("starts_at")
        .limit(1)
        .maybeSingle()
        .throwOnError();
      if (data) {
        await admin
          .from("appointments")
          .update({ status: "cancelado" })
          .eq("id", data.id)
          .throwOnError();
      }
    }
  }
}

/** Consulta ou altera a agenda da clínica pelo modo configurado. Nunca lança erro: devolve { erro }. */
export async function callAgenda(
  integration: Integration,
  services: { name: string; duration_minutes: number }[],
  action: string,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return { erro: `Ação de agenda desconhecida: ${action}` };
  }
  if (!integration.enabled) {
    return { erro: "A conexão com a agenda não está ativada nesta clínica." };
  }

  const extra = extraVars(action, params, services);
  let result: AgendaResult;
  try {
    const { data: apiKey } = await createAdminClient().rpc(
      "get_clinic_secret",
      { p_clinic_id: integration.clinic_id, p_kind: "agenda_api_key" },
    );
    result =
      integration.mode === "custom"
        ? await callCustomApi(integration, apiKey ?? "", action, {
            ...params,
            ...extra,
          })
        : integration.webhook_url
          ? await callWebhook(integration, apiKey ?? "", action, {
              ...params,
              ...extra,
            })
          : {
              erro: "A conexão com a agenda não está ativada nesta clínica.",
            };
  } catch (e) {
    console.error(`[agenda] ${action}:`, (e as Error).message);
    return {
      erro: "Não foi possível conectar ao sistema de agenda agora. Tente novamente em instantes.",
    };
  }

  try {
    await mirrorAppointment(
      integration.clinic_id,
      action,
      params,
      extra,
      result,
    );
  } catch (e) {
    // a resposta ao paciente não depende da cópia local
    console.error("[agenda] cópia local do agendamento:", (e as Error).message);
  }
  return result;
}
