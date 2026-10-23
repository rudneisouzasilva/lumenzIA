"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import {
  FIELD_MODES,
  MAX_CUSTOM_FIELD_NAME,
  MAX_CUSTOM_FIELDS,
} from "@/lib/booking-fields";
import { getActionContext } from "@/lib/painel/context";

const fail = (error: string): FormResult => ({ ok: false, error });

const bookingFieldsSchema = z.object({
  email: z.enum(FIELD_MODES),
  cpf: z.enum(FIELD_MODES),
  data_nascimento: z.enum(FIELD_MODES),
  personalizados: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(MAX_CUSTOM_FIELD_NAME),
        obrigatorio: z.boolean(),
      }),
    )
    .max(MAX_CUSTOM_FIELDS),
});

/** Quais dados a assistente pede antes de criar um agendamento. */
export async function saveBookingFields(input: unknown): Promise<FormResult> {
  const parsed = bookingFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      `Dê um nome (até ${MAX_CUSTOM_FIELD_NAME} letras) a cada campo, com no máximo ${MAX_CUSTOM_FIELDS} campos próprios.`,
    );
  }
  const names = parsed.data.personalizados.map((c) => c.nome.toLowerCase());
  if (new Set(names).size !== names.length) {
    return fail("Há dois campos com o mesmo nome.");
  }
  const ctx = await getActionContext("roteiro");
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await ctx.supabase
    .from("clinics")
    .update({ booking_fields: parsed.data })
    .eq("id", ctx.clinic.id);
  if (error) {
    console.error("[painel] dados do agendamento:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}
