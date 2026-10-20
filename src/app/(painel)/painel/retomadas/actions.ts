"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  checkFollowUpDate,
  followUpDueAt,
  setPendingFollowUp,
} from "@/lib/ai/follow-up";
import type { FormResult } from "@/lib/auth/validation";
import { normalizePhone } from "@/lib/format";
import { getActionContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";

const fail = (error: string): FormResult => ({ ok: false, error });

const settingsSchema = z.object({
  abandonedDays: z.number().int().min(1).max(90).nullable(),
  concludedDays: z.number().int().min(1).max(90).nullable(),
  maxAttempts: z.number().int().min(1).max(3),
});

/** Quando a LumenzIA retoma sozinha as conversas que não terminaram em agendamento. */
export async function saveFollowUpSettings(
  input: unknown,
): Promise<FormResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await ctx.supabase
    .from("clinics")
    .update({
      followup_abandoned_days: parsed.data.abandonedDays,
      followup_concluded_days: parsed.data.concludedDays,
      followup_max_attempts: parsed.data.maxAttempts,
    })
    .eq("id", ctx.clinic.id);
  if (error) {
    console.error("[retomadas] configurações:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}

const createSchema = z.object({
  phone: z.string().trim().min(8).max(30),
  date: z.string(),
  reason: z.string().trim().max(120),
  note: z.string().trim().max(500),
});

/** A equipe marca uma retomada para um número (substitui a pendente, se houver). */
export async function createFollowUp(input: unknown): Promise<FormResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const v = parsed.data;
  const phone = normalizePhone(v.phone);
  if (!phone) return fail("Confira o número do WhatsApp, com o DDD.");
  const checked = checkFollowUpDate(v.date);
  if ("error" in checked) return fail(checked.error);

  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();
  try {
    const { data: contactId } = await admin
      .rpc("ensure_contact", { p_clinic_id: ctx.clinic.id, p_phone: phone })
      .throwOnError();
    const { data: contact } = await admin
      .from("contacts")
      .select("opted_out_at")
      .eq("id", contactId)
      .single()
      .throwOnError();
    if (contact.opted_out_at) {
      return fail(
        "Esta pessoa pediu para não receber mensagens automáticas. Fale com ela pela tela Conversas.",
      );
    }
    await setPendingFollowUp(admin, {
      clinicId: ctx.clinic.id,
      contactId,
      conversationId: null,
      date: checked.date,
      source: "manual",
      reason: v.reason,
      note: v.note,
      createdBy: ctx.user.id,
    });
  } catch (e) {
    console.error("[retomadas] criar:", (e as Error).message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}

const idSchema = z.number().int().positive();

/** Muda o dia de uma retomada pendente. */
export async function rescheduleFollowUp(
  id: unknown,
  date: unknown,
): Promise<FormResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("Retomada não encontrada.");
  const checked = checkFollowUpDate(date);
  if ("error" in checked) return fail(checked.error);
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { data, error } = await createAdminClient()
    .from("follow_ups")
    .update({
      due_at: followUpDueAt(checked.date),
      failures: 0,
      last_error: null,
    })
    .eq("id", parsedId.data)
    .eq("clinic_id", ctx.clinic.id)
    .eq("status", "pendente")
    .select("id");
  if (error) {
    console.error("[retomadas] remarcar:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  if (!data.length) return fail("Esta retomada já foi enviada ou cancelada.");
  refresh();
  return { ok: true };
}

/** Cancela uma retomada pendente. */
export async function cancelFollowUp(id: unknown): Promise<FormResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("Retomada não encontrada.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await createAdminClient()
    .from("follow_ups")
    .update({ status: "cancelado", cancel_reason: "equipe" })
    .eq("id", parsedId.data)
    .eq("clinic_id", ctx.clinic.id)
    .eq("status", "pendente");
  if (error) {
    console.error("[retomadas] cancelar:", error.message);
    return fail("Não foi possível cancelar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}
