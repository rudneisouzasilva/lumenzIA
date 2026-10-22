import { z } from "zod";

/**
 * Regras dos formulários do painel, usadas no navegador (erros na hora) e de novo no servidor,
 * dentro das Server Actions. Os limites seguem os da migração 20261019000001_schema.sql.
 */

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Preencha ${label}.`)
    .max(max, `Use no máximo ${max} caracteres.`);

const optional = (max: number) =>
  z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

/** Tons de voz sugeridos. A clínica também pode escrever o seu. */
export const TONES = [
  {
    value: "acolhedor",
    label: "Acolhedor",
    description: "Caloroso e próximo, como uma recepcionista querida.",
    sample:
      "Oi, Ana! Que bom falar com você 💜 Me conta: o que você gostaria de cuidar hoje?",
  },
  {
    value: "profissional",
    label: "Profissional",
    description: "Educado, direto e objetivo.",
    sample:
      "Olá, Ana. Sou a assistente da clínica. Em que posso ajudar: informações, valores ou agendamento?",
  },
  {
    value: "descontraído",
    label: "Descontraído",
    description: "Leve e animado, com emojis na medida.",
    sample:
      "Oii, Ana! ✨ Tudo bem? Bora deixar sua pele ainda mais incrível? Me diz o que você procura!",
  },
  {
    value: "sofisticado",
    label: "Sofisticado",
    description: "Elegante e exclusivo, para clínicas premium.",
    sample:
      "Olá, Ana, seja muito bem-vinda. Será um prazer orientá-la. Qual tratamento despertou seu interesse?",
  },
] as const;

export const identitySchema = z.object({
  assistantName: required("o nome da assistente", 40),
  tone: required("o tom de voz", 60),
});

export const knowledgeSchema = z.object({
  businessInfo: optional(20000),
});

/** "" = usar o padrão da LumenzIA. */
export const TIMEOUT_OPTIONS = ["", "2", "6", "12", "24", "48", "72"] as const;

export const rulesSchema = z.object({
  behaviorRules: optional(5000),
  timeoutHours: z.enum(TIMEOUT_OPTIONS, "Escolha uma opção."),
});

export const pastConversationsSchema = z.object({
  pastConversations: optional(50000),
});

/** "08:30", ou "" quando não informado. */
const time = z.string().regex(/^(\d{2}:\d{2})?$/, "Horário inválido.");

/** Lembrete automático antes do agendamento (0 = sem lembrete). */
export const REMINDER_OPTIONS = [0, 2, 12, 24, 48] as const;

export const hoursSchema = z
  .object({
    workDays: z.array(z.number().int().min(1).max(7)).max(7),
    start: time,
    end: time,
    worksOnHolidays: z.boolean(),
    extraClosedDates: optional(2000),
  })
  .refine((v) => Boolean(v.start) === Boolean(v.end), {
    path: ["end"],
    message: "Informe a abertura e o fechamento.",
  })
  .refine((v) => !v.start || !v.end || v.end > v.start, {
    path: ["end"],
    message: "O fechamento precisa ser depois da abertura.",
  });

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120, "Nome muito longo."),
  phone: z
    .string()
    .trim()
    .refine((v) => {
      const digits = v.replace(/\D/g, "");
      return (
        digits.length === 0 || (digits.length >= 10 && digits.length <= 13)
      );
    }, "Informe um WhatsApp com DDD."),
});

export const clinicNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da clínica.")
    .max(120, "Nome muito longo."),
});

/**
 * Tipo de cada item de "Procedimentos": a avaliação, um procedimento que exige avaliação (quando a
 * clínica liga a exigência) ou um procedimento livre, que nunca exige.
 */
export const SERVICE_KINDS = ["avaliacao", "procedimento", "livre"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  avaliacao: "Avaliação",
  procedimento: "Procedimento",
  livre: "Livre (nunca exige avaliação)",
};

export const MAX_EVALUATION_VALIDITY_DAYS = 365;

/** Listas que a clínica monta e reordena (o nome é o da tabela no banco). */
export const listSchemas = {
  faqs: z.object({
    question: required("a pergunta", 500),
    answer: required("a resposta", 2000),
  }),
  ai_questions: z.object({
    question: required("a pergunta", 500),
  }),
  contact_reasons: z.object({
    name: required("o motivo", 120),
    description: optional(500),
  }),
  services: z.object({
    name: required("o procedimento", 120),
    duration_minutes: z
      .number("Informe a duração em minutos.")
      .int("Use minutos inteiros.")
      .min(5, "A duração mínima é de 5 minutos.")
      .max(720, "A duração máxima é de 12 horas."),
    kind: z.enum(SERVICE_KINDS, "Escolha o tipo."),
  }),
  professionals: z.object({
    name: required("o nome", 120),
  }),
};

export type ListKind = keyof typeof listSchemas;
export const LIST_KINDS = Object.keys(listSchemas) as ListKind[];

/** Quantos itens cada lista aceita, para a IA não receber um prompt gigante. */
export const LIST_LIMITS: Record<ListKind, number> = {
  faqs: 150,
  ai_questions: 30,
  contact_reasons: 40,
  services: 150,
  professionals: 60,
};

export type ListItem = { id: string } & Record<string, string | number>;

/** Colunas que o painel lê e devolve de cada lista. */
export const LIST_COLUMNS: Record<ListKind, string> = {
  faqs: "id, question, answer",
  ai_questions: "id, question",
  contact_reasons: "id, name, description",
  services: "id, name, duration_minutes, kind",
  professionals: "id, name",
};

export const MAX_IMAGES = 40;

export const imageDescriptionSchema = z.object({
  description: z
    .string()
    .trim()
    .min(3, "Diga quando a assistente deve enviar esta foto.")
    .max(500, "Use no máximo 500 caracteres."),
});
