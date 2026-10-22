/**
 * O pacote de mensagens prontas que a LumenzIA cria na conta de cada clínica ao conectar o
 * WhatsApp. Os textos seguem as regras da Meta: variáveis numeradas ({{1}}, {{2}}...) que nunca
 * abrem nem fecham o texto, e um exemplo para cada uma. Retomadas são "marketing" (cobradas por
 * mensagem pela Meta e com limite de frequência por pessoa); lembretes e avisos são "utilidade".
 */

export type TemplatePurpose =
  | "retomada_pedido"
  | "retomada_sem_resposta"
  | "lembrete"
  | "aviso_equipe"
  | "reabrir"
  | "outro";

type PackItem = {
  purpose: Exclude<TemplatePurpose, "outro">;
  name: string;
  title: string;
  description: string;
  category: "MARKETING" | "UTILITY";
  body: string;
  footer: string;
  /** O que vai em cada variável, na ordem. */
  params: string[];
  example: (clinic: { clinic: string; assistant: string }) => string[];
};

export const OPT_OUT_FOOTER = "Responda SAIR para não receber mais mensagens.";

export const TEMPLATE_PACK: PackItem[] = [
  {
    purpose: "retomada_pedido",
    name: "lumenzia_retomada_pedido",
    title: "Retomada combinada com o paciente",
    description:
      'Enviada na data que a própria pessoa pediu ("pode me chamar em novembro").',
    category: "MARKETING",
    body: "Oi! Aqui é {{1}}, da {{2}}. 😊 Você pediu para conversarmos de novo sobre {{3}} nesta época. Ainda tem interesse? É só responder esta mensagem.",
    footer: OPT_OUT_FOOTER,
    params: ["Nome da assistente", "Nome da clínica", "Assunto"],
    example: ({ clinic, assistant }) => [assistant, clinic, "limpeza de pele"],
  },
  {
    purpose: "retomada_sem_resposta",
    name: "lumenzia_retomada_sem_resposta",
    title: "Retomada pelo prazo da clínica",
    description:
      "Enviada depois dos dias que a clínica escolheu, para quem não agendou.",
    category: "MARKETING",
    body: "Oi! Aqui é {{1}}, da {{2}}. Ficou alguma dúvida sobre {{3}}? Se quiser, posso te ajudar a encontrar um horário. É só responder por aqui.",
    footer: OPT_OUT_FOOTER,
    params: ["Nome da assistente", "Nome da clínica", "Assunto"],
    example: ({ clinic, assistant }) => [assistant, clinic, "botox"],
  },
  {
    purpose: "reabrir",
    name: "lumenzia_continuar_conversa",
    title: "Continuar a conversa",
    description:
      "Para a equipe retomar uma conversa depois das 24 horas do WhatsApp.",
    category: "MARKETING",
    body: "Olá, {{1}}! Aqui é a equipe da {{2}}. Podemos continuar nosso atendimento por aqui? É só responder esta mensagem. 😊",
    footer: OPT_OUT_FOOTER,
    params: ["Primeiro nome do paciente", "Nome da clínica"],
    example: ({ clinic }) => ["Ana", clinic],
  },
  {
    purpose: "lembrete",
    name: "lumenzia_lembrete_agendamento",
    title: "Lembrete de agendamento",
    description:
      "Enviado antes do horário marcado, no prazo escolhido em Lembretes e avisos.",
    category: "UTILITY",
    body: "Olá, {{1}}! Passando para lembrar do seu horário na clínica: {{2}}. Se precisar remarcar, é só responder esta mensagem.",
    footer: "",
    params: ["Primeiro nome do paciente", "Data e hora"],
    example: () => ["Ana", "segunda-feira, 20/10, 14:30"],
  },
  {
    purpose: "aviso_equipe",
    name: "lumenzia_aviso_equipe",
    title: "Aviso para a equipe",
    description:
      "Vai para o WhatsApp da equipe quando um paciente precisa de atendimento humano.",
    category: "UTILITY",
    body: "Aviso da assistente LumenzIA: {{1}}. Detalhes: {{2}}. Abra o painel da LumenzIA para responder.",
    footer: "",
    params: ["Paciente ou assunto", "Detalhes"],
    example: () => [
      "+55 41 99999-0000",
      "Quero falar com uma pessoa da equipe",
    ],
  },
];

export const PURPOSE_LABEL: Record<TemplatePurpose, string> = {
  retomada_pedido: "Retomada combinada",
  retomada_sem_resposta: "Retomada pelo prazo",
  reabrir: "Continuar conversa",
  lembrete: "Lembrete",
  aviso_equipe: "Aviso à equipe",
  outro: "Da clínica",
};

/** Quantas variáveis ({{1}}, {{2}}...) o texto usa: a maior numeração encontrada. */
export function placeholderCount(body: string) {
  let max = 0;
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** O que mostrar no campo de cada variável ao enviar uma mensagem pronta. */
export function paramLabels(purpose: TemplatePurpose, body: string) {
  const known = TEMPLATE_PACK.find((t) => t.purpose === purpose)?.params ?? [];
  return Array.from(
    { length: placeholderCount(body) },
    (_, i) => known[i] ?? `Variável ${i + 1}`,
  );
}

/**
 * Confere um texto antes de mandar para a Meta: variáveis em sequência a partir de 1, sem abrir
 * nem fechar o texto. Devolve o problema, ou null.
 */
export function templateBodyProblem(body: string) {
  const text = body.trim();
  if (!text) return "Escreva o texto da mensagem.";
  if (text.length > 1024) return "Use no máximo 1024 caracteres.";
  const numbers = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) =>
    Number(m[1]),
  );
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (unique.some((n, i) => n !== i + 1)) {
    return "Numere as variáveis em sequência: {{1}}, {{2}}, {{3}}...";
  }
  if (
    /^\{\{\s*\d+\s*\}\}/.test(text) ||
    /\{\{\s*\d+\s*\}\}[.!?]?$/.test(text)
  ) {
    return "A Meta não aceita texto que começa ou termina com uma variável.";
  }
  if (/\{\{(?!\s*\d+\s*\}\})/.test(text)) {
    return "Use variáveis só no formato {{1}}.";
  }
  return null;
}
