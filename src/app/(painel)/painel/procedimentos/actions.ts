"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import { getActionContext } from "@/lib/painel/context";
import { MAX_EVALUATION_VALIDITY_DAYS } from "@/lib/painel/validation";

const settingsSchema = z.object({
  required: z.boolean(),
  validityDays: z
    .number()
    .int()
    .min(1)
    .max(MAX_EVALUATION_VALIDITY_DAYS)
    .nullable(),
});

/** Se a IA só agenda procedimentos depois de uma avaliação, e até quantos dias depois dela. */
export async function saveEvaluationSettings(
  input: unknown,
): Promise<FormResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Use um prazo entre 1 e ${MAX_EVALUATION_VALIDITY_DAYS} dias.`,
    };
  }
  const ctx = await getActionContext("procedimentos");
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from("clinics")
    .update({
      require_evaluation: parsed.data.required,
      evaluation_validity_days: parsed.data.validityDays,
    })
    .eq("id", ctx.clinic.id);
  if (error) {
    console.error("[procedimentos] avaliação:", error.message);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo.",
    };
  }
  refresh();
  return { ok: true };
}
