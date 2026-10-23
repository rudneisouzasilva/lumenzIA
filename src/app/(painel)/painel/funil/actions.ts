"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import { getActionContext } from "@/lib/painel/context";
import { STAGE_COLORS } from "@/lib/painel/pipeline";

const fail = (error: string): FormResult => ({ ok: false, error });
const saveError = (where: string, message: string) => {
  console.error(`[funil] ${where}:`, message);
  return fail("Não foi possível salvar agora. Tente de novo.");
};

const uuid = z.uuid();
const MAX_STAGES = 12;
const MAX_LOST_REASONS = 20;

const moveSchema = z.object({
  contactId: uuid,
  stageId: uuid,
  lostReasonId: uuid.nullable(),
});

/** Move um contato de etapa (arrastando no quadro ou pelo "Mover para"). */
export async function moveContact(input: unknown): Promise<FormResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("Etapa inválida.");
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);

  const { data, error } = await ctx.supabase
    .from("contacts")
    .update({
      stage_id: parsed.data.stageId,
      lost_reason_id: parsed.data.lostReasonId,
    })
    .eq("id", parsed.data.contactId)
    .eq("clinic_id", ctx.clinic.id)
    .select("id");
  if (error) return saveError("mover", error.message);
  if (!data.length) return fail("Contato não encontrado.");
  refresh();
  return { ok: true };
}

const detailsSchema = z.object({
  contactId: uuid,
  name: z.string().trim().max(120),
  ownerId: uuid.nullable(),
  estimatedValueCents: z.number().int().min(0).max(100_000_000).nullable(),
  notes: z.string().trim().max(2000),
  lostReasonId: uuid.nullable(),
});

/** Nome, responsável, valor estimado e anotações do contato. */
export async function saveContactDetails(input: unknown): Promise<FormResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const v = parsed.data;
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);

  if (v.ownerId) {
    const { data: member } = await ctx.supabase
      .from("clinic_members")
      .select("user_id")
      .eq("clinic_id", ctx.clinic.id)
      .eq("user_id", v.ownerId)
      .maybeSingle();
    if (!member) return fail("Escolha alguém da equipe da clínica.");
  }

  const { error } = await ctx.supabase
    .from("contacts")
    .update({
      name: v.name,
      owner_id: v.ownerId,
      estimated_value_cents: v.estimatedValueCents,
      notes: v.notes,
      lost_reason_id: v.lostReasonId,
    })
    .eq("id", v.contactId)
    .eq("clinic_id", ctx.clinic.id);
  if (error) return saveError("contato", error.message);
  refresh();
  return { ok: true };
}

const stageSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(1).max(40),
  color: z.enum(STAGE_COLORS),
  kind: z.enum(["aberto", "ganho", "perdido"]),
});

/** Cria (id = null) ou altera uma etapa do funil. */
export async function saveStage(input: unknown): Promise<FormResult> {
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fail("Dê um nome à etapa.");
  const v = parsed.data;
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);

  if (v.id) {
    const { error } = await ctx.supabase
      .from("pipeline_stages")
      .update({ name: v.name, color: v.color, kind: v.kind })
      .eq("id", v.id)
      .eq("clinic_id", ctx.clinic.id);
    if (error) return saveError("etapa", error.message);
  } else {
    const { data: stages, error: listError } = await ctx.supabase
      .from("pipeline_stages")
      .select("sort_order, kind")
      .eq("clinic_id", ctx.clinic.id);
    if (listError) return saveError("etapas", listError.message);
    if (stages.length >= MAX_STAGES) {
      return fail(`O funil pode ter até ${MAX_STAGES} etapas.`);
    }
    // Uma etapa nova entra antes das de "perdido".
    const open = stages.filter((s) => s.kind !== "perdido");
    const sortOrder = Math.max(0, ...open.map((s) => s.sort_order)) + 5;
    const { error } = await ctx.supabase.from("pipeline_stages").insert({
      clinic_id: ctx.clinic.id,
      name: v.name,
      color: v.color,
      kind: v.kind,
      sort_order: sortOrder,
    });
    if (error) return saveError("nova etapa", error.message);
  }
  refresh();
  return { ok: true };
}

/** Nova ordem das etapas (a lista inteira, da primeira à última). */
export async function reorderStages(ids: unknown): Promise<FormResult> {
  const parsed = z.array(uuid).min(1).max(MAX_STAGES).safeParse(ids);
  if (!parsed.success) return fail("Ordem inválida.");
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);

  const results = await Promise.all(
    parsed.data.map((id, i) =>
      ctx.supabase
        .from("pipeline_stages")
        .update({ sort_order: (i + 1) * 10 })
        .eq("id", id)
        .eq("clinic_id", ctx.clinic.id),
    ),
  );
  const error = results.find((r) => r.error)?.error;
  if (error) return saveError("ordem", error.message);
  refresh();
  return { ok: true };
}

/** Apaga uma etapa, passando os contatos dela para outra. */
export async function deleteStage(
  id: unknown,
  moveTo: unknown,
): Promise<FormResult> {
  const parsedId = uuid.safeParse(id);
  const parsedTo = uuid.safeParse(moveTo);
  if (!parsedId.success || !parsedTo.success || parsedId.data === parsedTo.data)
    return fail("Escolha para qual etapa vão os contatos.");
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);

  const { error: moveError } = await ctx.supabase
    .from("contacts")
    .update({ stage_id: parsedTo.data })
    .eq("clinic_id", ctx.clinic.id)
    .eq("stage_id", parsedId.data);
  if (moveError) return saveError("mover contatos", moveError.message);
  const { error } = await ctx.supabase
    .from("pipeline_stages")
    .delete()
    .eq("id", parsedId.data)
    .eq("clinic_id", ctx.clinic.id);
  if (error) return saveError("apagar etapa", error.message);
  refresh();
  return { ok: true };
}

const lostReasonSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(1).max(60),
});

export async function saveLostReason(input: unknown): Promise<FormResult> {
  const parsed = lostReasonSchema.safeParse(input);
  if (!parsed.success) return fail("Dê um nome ao motivo.");
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);

  if (parsed.data.id) {
    const { error } = await ctx.supabase
      .from("lost_reasons")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.id)
      .eq("clinic_id", ctx.clinic.id);
    if (error) return saveError("motivo de perda", error.message);
  } else {
    const { data: existing, error: listError } = await ctx.supabase
      .from("lost_reasons")
      .select("sort_order")
      .eq("clinic_id", ctx.clinic.id);
    if (listError) return saveError("motivos de perda", listError.message);
    if (existing.length >= MAX_LOST_REASONS) {
      return fail(`Use até ${MAX_LOST_REASONS} motivos.`);
    }
    const { error } = await ctx.supabase.from("lost_reasons").insert({
      clinic_id: ctx.clinic.id,
      name: parsed.data.name,
      sort_order: Math.max(0, ...existing.map((r) => r.sort_order)) + 10,
    });
    if (error) return saveError("novo motivo de perda", error.message);
  }
  refresh();
  return { ok: true };
}

export async function deleteLostReason(id: unknown): Promise<FormResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return fail("Motivo não encontrado.");
  const ctx = await getActionContext("funil");
  if ("error" in ctx) return fail(ctx.error);
  const { error } = await ctx.supabase
    .from("lost_reasons")
    .delete()
    .eq("id", parsed.data)
    .eq("clinic_id", ctx.clinic.id);
  if (error) return saveError("apagar motivo de perda", error.message);
  refresh();
  return { ok: true };
}
