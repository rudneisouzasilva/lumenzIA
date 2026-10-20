import { z } from "zod";

/**
 * Formulários técnicos do painel da equipe (WhatsApp, templates e agenda), validados no navegador
 * e de novo nas Server Actions. Segredos (token, chave da agenda) são só de escrita: vazio
 * mantém o que está guardado no Vault.
 */

const metaId = z
  .string()
  .trim()
  .regex(/^(\d{5,30})?$/, "Só números, como aparece no painel da Meta.");

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(
    (v) => v === "" || (v.length >= 10 && v.length <= 15),
    "Número com DDI e DDD, ex.: 5511999990000.",
  );

const secret = (max: number) =>
  z.string().trim().max(max, `Use no máximo ${max} caracteres.`);

export const whatsappTechSchema = z.object({
  phoneNumberId: metaId,
  wabaId: metaId,
  displayPhone: z.string().trim().max(40, "Use no máximo 40 caracteres."),
  staffPhone: phone,
  token: secret(2000),
  removeToken: z.boolean(),
});

const templateName = z
  .string()
  .trim()
  .regex(
    /^([a-z0-9_]{1,512})?$/,
    "Nome do template como aprovado na Meta: letras minúsculas, números e _.",
  );

export const templatesSchema = z.object({
  reminderTemplate: templateName,
  staffAlertTemplate: templateName,
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Código de idioma, ex.: pt_BR."),
});

export const AGENDA_ACTIONS = [
  "consultar_disponibilidade",
  "criar_agendamento",
  "consultar_agendamentos",
  "cancelar_agendamento",
  "listar_agendamentos",
] as const;

const actionConfig = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  url: z.string().regex(/^https?:\/\//, "A URL precisa começar com https://"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

/** O JSON do modo "custom": um objeto com uma entrada por ação (veja src/lib/ai/agenda.ts). */
export const actionsConfigSchema = z.partialRecord(
  z.enum(AGENDA_ACTIONS, "Ação desconhecida."),
  actionConfig,
);

export function parseActionsConfig(text: string) {
  if (!text.trim()) return { ok: true as const, value: null };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false as const, error: "JSON inválido." };
  }
  const parsed = actionsConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.code === "unrecognized_keys") {
      return {
        ok: false as const,
        error: `Ação desconhecida: ${issue.keys.join(", ")}. Use ${AGENDA_ACTIONS.join(", ")}.`,
      };
    }
    return {
      ok: false as const,
      error: `${issue.path.join(".") || "JSON"}: ${issue.message}`,
    };
  }
  return { ok: true as const, value: parsed.data };
}

export const agendaSchema = z
  .object({
    providerName: z.string().trim().max(120, "Use no máximo 120 caracteres."),
    mode: z.enum(["webhook", "custom"]),
    webhookUrl: z
      .string()
      .trim()
      .regex(/^(https:\/\/\S+)?$/, "Use um endereço https://."),
    actionsConfig: z.string().max(20000, "JSON muito grande."),
    enabled: z.boolean(),
    apiKey: secret(10000),
    removeApiKey: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "webhook" && v.enabled && !v.webhookUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["webhookUrl"],
        message: "Informe o endereço do webhook para ativar a agenda.",
      });
    }
    const config = parseActionsConfig(v.actionsConfig);
    if (!config.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["actionsConfig"],
        message: config.error,
      });
    } else if (v.mode === "custom" && v.enabled && !config.value) {
      ctx.addIssue({
        code: "custom",
        path: ["actionsConfig"],
        message: "Configure as ações para ativar o modo personalizado.",
      });
    }
  });

export type WhatsappTech = z.input<typeof whatsappTechSchema>;
export type Templates = z.input<typeof templatesSchema>;
export type Agenda = z.input<typeof agendaSchema>;
