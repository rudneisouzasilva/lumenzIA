import "server-only";

import { AiError, generateJson } from "./provider";

/**
 * Preencher com IA
 * ----------------
 * A clínica cola um texto (site, cardápio de preços, bio e posts do Instagram, um documento) e a
 * IA organiza o que der para aproveitar: informações gerais, procedimentos, perguntas frequentes,
 * profissionais e horários. Nada é gravado aqui: a tela mostra a sugestão para a clínica revisar.
 */

export const AUTOFILL_MIN_CHARS = 30;
export const AUTOFILL_MAX_CHARS = 20_000;

export type SetupSuggestion = {
  businessInfo: string;
  services: {
    name: string;
    durationMinutes: number;
    kind: "avaliacao" | "procedimento" | "livre";
  }[];
  faqs: { question: string; answer: string }[];
  professionals: string[];
  hours: { workDays: number[]; start: string; end: string } | null;
};

const text = { type: "string" };
const item = (props: Record<string, unknown>) => ({
  type: "object",
  properties: props,
  required: Object.keys(props),
});

const SCHEMA = {
  type: "object",
  properties: {
    informacoes: text,
    procedimentos: {
      type: "array",
      items: item({
        nome: text,
        duracao_minutos: { type: "integer" },
        tipo: { type: "string", enum: ["avaliacao", "procedimento", "livre"] },
      }),
    },
    perguntas: {
      type: "array",
      items: item({ pergunta: text, resposta: text }),
    },
    profissionais: { type: "array", items: text },
    horarios: item({
      dias: { type: "array", items: { type: "integer" } },
      abre: text,
      fecha: text,
    }),
  },
  required: [
    "informacoes",
    "procedimentos",
    "perguntas",
    "profissionais",
    "horarios",
  ],
};

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "8h", "8:00", "08h30" → "08:00"/"08:30"; o resto vira "". */
function toTime(v: unknown) {
  const m = str(v, 10).match(/^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?$/i);
  if (!m) return "";
  const t = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
  return TIME.test(t) ? t : "";
}

/** Sem repetir (ignorando maiúsculas e espaços). */
function unique<T>(list: T[], key: (x: T) => string) {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = key(x).toLowerCase().replace(/\s+/g, " ");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function normalizeSuggestion(raw: unknown): SetupSuggestion {
  const p = obj(raw);
  const services = unique(
    arr(p.procedimentos).map((x) => {
      const o = obj(x);
      const minutes = Math.round(Number(o.duracao_minutos));
      const kind = o.tipo;
      const service: SetupSuggestion["services"][number] = {
        name: str(o.nome, 120),
        durationMinutes: minutes >= 5 && minutes <= 720 ? minutes : 60,
        kind: kind === "avaliacao" || kind === "livre" ? kind : "procedimento",
      };
      return service;
    }),
    (s) => s.name,
  ).slice(0, 60);
  const faqs = unique(
    arr(p.perguntas).map((x) => {
      const o = obj(x);
      return { question: str(o.pergunta, 500), answer: str(o.resposta, 2000) };
    }),
    (f) => f.question,
  )
    .filter((f) => f.answer)
    .slice(0, 40);
  const professionals = unique(
    arr(p.profissionais).map((x) => str(x, 120)),
    (n) => n,
  ).slice(0, 30);

  const h = obj(p.horarios);
  const workDays = [
    ...new Set(
      arr(h.dias)
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
    ),
  ].sort();
  const start = toTime(h.abre);
  const end = toTime(h.fecha);
  const hours =
    workDays.length && start && end && end > start
      ? { workDays, start, end }
      : null;

  return {
    businessInfo: str(p.informacoes, 8000),
    services,
    faqs,
    professionals,
    hours,
  };
}

export async function suggestClinicSetup({
  clinicName,
  source,
}: {
  clinicName: string;
  source: string;
}): Promise<SetupSuggestion> {
  const prompt = [
    `Você ajuda a configurar a assistente virtual de atendimento da clínica "${clinicName}" (estética ou saúde). Abaixo está um texto da própria clínica: pode ser o site, uma tabela de preços, a bio e as legendas do Instagram ou um documento.`,
    "",
    "Extraia somente o que está escrito no texto. Não invente procedimentos, preços, endereços, nomes nem horários. Se algo não aparece, deixe a lista vazia ou o campo em branco.",
    "",
    "- informacoes: um resumo organizado, em tópicos curtos, com o que a assistente precisa saber para responder pacientes: endereço, como chegar, contatos, preços e valores (exatamente como no texto), formas de pagamento, convênios, diferenciais, regras (atrasos, cancelamento, retorno). Sem repetir o que já vai nas perguntas. Em branco se não houver nada útil.",
    '- procedimentos: cada procedimento ou serviço oferecido. nome curto (ex.: "Limpeza de pele"). duracao_minutos só se o texto disser; senão 60. tipo: "avaliacao" para consultas ou avaliações, "livre" para retornos e manutenções simples, "procedimento" para o resto.',
    "- perguntas: perguntas frequentes que um paciente faria e cuja resposta está no texto (preço, preparo, duração do efeito, contraindicações, pagamento). Resposta curta, no tom da clínica.",
    '- profissionais: nomes de profissionais que atendem (só nomes de pessoas, com o título se houver, ex.: "Dra. Ana Lima").',
    "- horarios: dias de atendimento (1 = segunda ... 7 = domingo), abre e fecha no formato HH:MM. Se o horário muda conforme o dia, use o mais comum. Se o texto não diz, dias vazio e abre/fecha em branco.",
    "",
    "Escreva em português do Brasil.",
    "",
    "Texto da clínica:",
    '"""',
    source,
    '"""',
  ].join("\n");

  const raw = await generateJson({
    prompt,
    schema: SCHEMA,
    temperature: 0.2,
    maxTokens: 8192,
    use: "chat",
    timeoutMs: 50_000,
    label: "preencher com IA",
    failure:
      "Não foi possível ler o texto agora. Tente de novo em alguns minutos.",
  });
  try {
    return normalizeSuggestion(JSON.parse(raw));
  } catch {
    throw new AiError("A leitura veio incompleta. Tente de novo.");
  }
}
