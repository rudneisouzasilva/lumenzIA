import "server-only";

import { ApiError } from "@google/genai";

import { AiError, gemini } from "./engine";

/**
 * Análise mensal da IA
 * --------------------
 * A IA lê os números de 12 meses da clínica (conversas, agendamentos, motivos, perdas, retomadas,
 * dias e horários) e uma amostra dos resumos das conversas, sem nome nem telefone de ninguém, e
 * devolve uma leitura em português com o que fazer. Usa um modelo com mais raciocínio do que o do
 * atendimento, porque roda no máximo uma vez por mês.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

export function insightsModel() {
  return process.env.GEMINI_INSIGHTS_MODEL?.trim() || DEFAULT_MODEL;
}

export type Insights = {
  resumo: string;
  destaques: { titulo: string; detalhe: string }[];
  motivacoes: { motivo: string; leitura: string }[];
  perdas: { causa: string; leitura: string }[];
  oportunidades: { titulo: string; acao: string }[];
  recomendacoes: {
    acao: string;
    porque: string;
    impacto: "alto" | "medio" | "baixo";
  }[];
};

const item = (props: Record<string, unknown>) => ({
  type: "object",
  properties: props,
  required: Object.keys(props),
});
const text = { type: "string" };

const SCHEMA = {
  type: "object",
  properties: {
    resumo: text,
    destaques: {
      type: "array",
      items: item({ titulo: text, detalhe: text }),
    },
    motivacoes: {
      type: "array",
      items: item({ motivo: text, leitura: text }),
    },
    perdas: { type: "array", items: item({ causa: text, leitura: text }) },
    oportunidades: {
      type: "array",
      items: item({ titulo: text, acao: text }),
    },
    recomendacoes: {
      type: "array",
      items: item({
        acao: text,
        porque: text,
        impacto: { type: "string", enum: ["alto", "medio", "baixo"] },
      }),
    },
  },
  required: [
    "resumo",
    "destaques",
    "motivacoes",
    "perdas",
    "oportunidades",
    "recomendacoes",
  ],
};

function thinking(model: string) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 2048 };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 4096 };
  return {};
}

const strings = (v: unknown) => (typeof v === "string" ? v.trim() : "");
function list<T>(v: unknown, map: (x: Record<string, unknown>) => T | null) {
  return (Array.isArray(v) ? v : [])
    .map((x) => (x && typeof x === "object" ? map(x) : null))
    .filter((x): x is T => x !== null)
    .slice(0, 8);
}

export async function generateInsights({
  clinicName,
  dataset,
}: {
  clinicName: string;
  dataset: unknown;
}): Promise<Insights> {
  const prompt = [
    `Você é um consultor comercial de clínicas de estética. Analise os dados de atendimento pelo WhatsApp da clínica "${clinicName}" nos últimos 12 meses.`,
    "",
    "Como ler os dados:",
    "- totals: o funil do período. new_contacts = pessoas que chamaram pela primeira vez; won = agendaram; lost = perdidas (etapa de perda ou mais de 30 dias sem contato); open = ainda em negociação. by_stage.reached = quantos chegaram a cada etapa. by_reason = motivo da conversa e quantas terminaram em agendamento em até 30 dias. lost_reasons = motivos de perda marcados pela equipe. follow_ups = mensagens de retomada enviadas, respondidas e que viraram agendamento.",
    "- monthly: a evolução mês a mês. by_weekday_hour: conversas por dia da semana (1 = segunda) e hora, e quantas viraram agendamento. procedures: procedimentos mais agendados. staff_share: quantas conversas precisaram da equipe.",
    "- summaries: resumos curtos de conversas (feitos por IA), com o desfecho. Use para entender motivações e objeções, sem citar casos individuais.",
    "",
    "Regras:",
    "- Escreva em português do Brasil, para a dona ou o gerente da clínica: frases curtas e diretas, sem jargão.",
    "- Baseie cada afirmação nos números; cite porcentagens e quantidades quando ajudarem. Se houver poucos dados para concluir algo, diga isso em vez de inventar.",
    "- Não mencione nomes, telefones nem dados de pacientes.",
    "- resumo: 2 a 3 frases com o principal do ano.",
    "- destaques: 3 a 5 fatos importantes (bons ou ruins), com o número que mostra cada um.",
    "- motivacoes: por que as pessoas procuram a clínica e quais motivos mais viram agendamento.",
    "- perdas: por que as pessoas não agendam (objeções, abandono, horários).",
    "- oportunidades: grupos de contatos ou momentos que a clínica pode aproveitar (ex.: quem perguntou preço e não voltou, horários com muita procura).",
    "- recomendacoes: 3 a 6 ações práticas para o próximo mês, com o motivo e o impacto esperado.",
    "",
    "Dados (JSON):",
    JSON.stringify(dataset),
  ].join("\n");

  const model = insightsModel();
  let raw: string;
  try {
    const response = await gemini().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        thinkingConfig: thinking(model),
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
        httpOptions: { timeout: 50_000 },
      },
    });
    raw = response.text ?? "";
    const usage = response.usageMetadata;
    console.log(
      `[gemini] análise ${model}: entrada=${usage?.promptTokenCount ?? 0}, saída=${usage?.candidatesTokenCount ?? 0}, raciocínio=${usage?.thoughtsTokenCount ?? 0}`,
    );
  } catch (e) {
    if (e instanceof AiError) throw e;
    const status = e instanceof ApiError ? e.status : "rede";
    console.error(`[gemini] análise ${status}:`, (e as Error).message);
    throw new AiError(
      "Não foi possível gerar a análise agora. Tente de novo em alguns minutos.",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError("A análise veio incompleta. Tente de novo.");
  }
  const insights: Insights = {
    resumo: strings(parsed.resumo),
    destaques: list(parsed.destaques, (x) =>
      strings(x.titulo)
        ? { titulo: strings(x.titulo), detalhe: strings(x.detalhe) }
        : null,
    ),
    motivacoes: list(parsed.motivacoes, (x) =>
      strings(x.motivo)
        ? { motivo: strings(x.motivo), leitura: strings(x.leitura) }
        : null,
    ),
    perdas: list(parsed.perdas, (x) =>
      strings(x.causa)
        ? { causa: strings(x.causa), leitura: strings(x.leitura) }
        : null,
    ),
    oportunidades: list(parsed.oportunidades, (x) =>
      strings(x.titulo)
        ? { titulo: strings(x.titulo), acao: strings(x.acao) }
        : null,
    ),
    recomendacoes: list(parsed.recomendacoes, (x) =>
      strings(x.acao)
        ? {
            acao: strings(x.acao),
            porque: strings(x.porque),
            impacto: (["alto", "medio", "baixo"].includes(strings(x.impacto))
              ? strings(x.impacto)
              : "medio") as Insights["recomendacoes"][number]["impacto"],
          }
        : null,
    ),
  };
  if (!insights.resumo) {
    throw new AiError("A análise veio incompleta. Tente de novo.");
  }
  return insights;
}
