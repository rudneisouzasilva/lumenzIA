import { z } from "zod";

import { AREA_KEYS, type Area } from "./areas";

/** Formulários da tela Equipe, validados no navegador e de novo nas Server Actions. */

const areas = z
  .array(z.enum(AREA_KEYS as [Area, ...Area[]]))
  .min(1, "Escolha pelo menos uma tela.")
  .transform((list) => [...new Set(list)]);

export const inviteSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome da pessoa.")
    .max(120, "Nome muito longo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail.")
    .pipe(z.email("E-mail inválido.")),
  areas,
});
export type InviteInput = z.input<typeof inviteSchema>;

export const memberAreasSchema = z.object({
  userId: z.uuid(),
  areas,
});

/** Convites valem 7 dias (o mesmo padrão da migração 0023). */
export const INVITE_DAYS = 7;
