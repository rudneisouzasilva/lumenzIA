"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";

import { resetPasswordSchema, type FormResult } from "@/lib/auth/validation";
import { getActionContext } from "@/lib/painel/context";
import type { Database } from "@/lib/supabase/database.types";
import {
  clinicNameSchema,
  LIST_COLUMNS,
  hoursSchema,
  identitySchema,
  imageDescriptionSchema,
  knowledgeSchema,
  LIST_KINDS,
  LIST_LIMITS,
  listSchemas,
  MAX_IMAGES,
  pastConversationsSchema,
  profileSchema,
  rulesSchema,
  type ListItem,
  type ListKind,
} from "@/lib/painel/validation";

type Failure = { ok: false; error: string };
type ActionContext = Exclude<
  Awaited<ReturnType<typeof getActionContext>>,
  { error: string }
>;

function fail(error: string): Failure {
  return { ok: false, error };
}

const invalid = () => fail("Confira os campos destacados.");
const saveError = (where: string, message: string) => {
  console.error(`[painel] ${where}:`, message);
  return fail("Não foi possível salvar agora. Tente de novo.");
};

/** Atualiza colunas de conteúdo da própria clínica (o RLS e o GRANT por coluna conferem de novo). */
async function updateClinic(
  where: string,
  values: {
    name?: string;
    assistant_name?: string;
    tone?: string;
    business_info?: string;
    past_conversations?: string;
    behavior_rules?: string;
    conversation_timeout_hours?: number | null;
    work_days?: number[];
    work_hours_start?: string | null;
    work_hours_end?: string | null;
    works_on_holidays?: boolean;
    extra_closed_dates?: string;
    is_active?: boolean;
  },
  existing?: ActionContext,
): Promise<FormResult> {
  const ctx = existing ?? (await getActionContext());
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await ctx.supabase
    .from("clinics")
    .update(values)
    .eq("id", ctx.clinic.id);
  if (error) return saveError(where, error.message);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Assistente
// ---------------------------------------------------------------------------------------------

export async function saveIdentity(input: unknown) {
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) return invalid();
  return updateClinic("identidade", {
    assistant_name: parsed.data.assistantName,
    tone: parsed.data.tone,
  });
}

export async function saveKnowledge(input: unknown) {
  const parsed = knowledgeSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return updateClinic("informações", {
    business_info: parsed.data.businessInfo,
  });
}

export async function saveRules(input: unknown) {
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return updateClinic("regras", {
    behavior_rules: parsed.data.behaviorRules,
    conversation_timeout_hours: parsed.data.timeoutHours
      ? Number(parsed.data.timeoutHours)
      : null,
  });
}

export async function savePastConversations(input: unknown) {
  const parsed = pastConversationsSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return updateClinic("conversas anteriores", {
    past_conversations: parsed.data.pastConversations,
  });
}

/** Liga ou desliga a assistente no WhatsApp (só depois que o número foi conectado). */
export async function setAssistantActive(active: boolean): Promise<FormResult> {
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  if (active) {
    const { data } = await ctx.supabase
      .from("clinics")
      .select("whatsapp_phone_number_id")
      .eq("id", ctx.clinic.id)
      .single();
    if (!data?.whatsapp_phone_number_id) {
      return fail(
        "Conecte o WhatsApp da clínica antes de ligar a assistente (menu WhatsApp).",
      );
    }
  }
  return updateClinic("ligar assistente", { is_active: Boolean(active) }, ctx);
}

// ---------------------------------------------------------------------------------------------
// Horários
// ---------------------------------------------------------------------------------------------

export async function saveHours(input: unknown): Promise<FormResult> {
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const v = parsed.data;

  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const [clinic, integration] = await Promise.all([
    ctx.supabase
      .from("clinics")
      .update({
        work_days: [...new Set(v.workDays)].sort(),
        work_hours_start: v.start || null,
        work_hours_end: v.end || null,
        works_on_holidays: v.worksOnHolidays,
        extra_closed_dates: v.extraClosedDates,
      })
      .eq("id", ctx.clinic.id),
    ctx.supabase
      .from("integrations")
      .update({ reminder_hours_before: v.reminderHoursBefore })
      .eq("clinic_id", ctx.clinic.id),
  ]);
  const error = clinic.error ?? integration.error;
  if (error) return saveError("horários", error.message);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Listas: FAQs, perguntas da IA, motivos de contato, procedimentos e profissionais
// ---------------------------------------------------------------------------------------------

const kindSchema = z.enum(LIST_KINDS as [ListKind, ...ListKind[]]);
const idSchema = z.uuid();

export type ListResult = { ok: true; item: ListItem } | Failure;

/**
 * As cinco listas têm a mesma forma (id, clinic_id, sort_order e os campos do schema), então
 * usamos uma só consulta, tipada como "faqs"; o Zod garante que só vão as colunas certas.
 */
function listTable(supabase: SupabaseClient<Database>, kind: ListKind) {
  return supabase.from(kind as "faqs");
}

/** Cria (id = null) ou altera um item de uma lista. */
export async function saveListItem(
  kind: ListKind,
  id: string | null,
  input: unknown,
): Promise<ListResult> {
  if (!kindSchema.safeParse(kind).success) return invalid();
  if (id !== null && !idSchema.safeParse(id).success) return invalid();
  const parsed = listSchemas[kind].safeParse(input);
  if (!parsed.success) return invalid();

  const ctx = await getActionContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const table = listTable(ctx.supabase, kind);
  const values = parsed.data as unknown as { question: string; answer: string };

  if (id) {
    const { data, error } = await table
      .update(values)
      .eq("id", id)
      .eq("clinic_id", ctx.clinic.id)
      .select(LIST_COLUMNS[kind])
      .maybeSingle();
    if (error) return saveError(kind, error.message);
    if (!data) return { ok: false, error: "Este item não existe mais." };
    refresh();
    return { ok: true, item: data as unknown as ListItem };
  }

  const { data: last, count } = await listTable(ctx.supabase, kind)
    .select("sort_order", { count: "exact" })
    .eq("clinic_id", ctx.clinic.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  if ((count ?? 0) >= LIST_LIMITS[kind]) {
    return {
      ok: false,
      error: `Esta lista aceita até ${LIST_LIMITS[kind]} itens.`,
    };
  }

  const { data, error } = await table
    .insert({
      ...values,
      clinic_id: ctx.clinic.id,
      sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    })
    .select(LIST_COLUMNS[kind])
    .single();
  if (error) return saveError(kind, error.message);
  refresh();
  return { ok: true, item: data as unknown as ListItem };
}

export async function deleteListItem(
  kind: ListKind,
  id: string,
): Promise<FormResult> {
  if (!kindSchema.safeParse(kind).success || !idSchema.safeParse(id).success)
    return invalid();
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await listTable(ctx.supabase, kind)
    .delete()
    .eq("id", id)
    .eq("clinic_id", ctx.clinic.id);
  if (error) return saveError(`apagar ${kind}`, error.message);
  refresh();
  return { ok: true };
}

/** Grava a nova ordem depois de arrastar (ids na ordem em que aparecem na tela). */
export async function reorderList(
  kind: ListKind,
  ids: string[],
): Promise<FormResult> {
  const parsed = z
    .object({ kind: kindSchema, ids: z.array(idSchema).max(200) })
    .safeParse({ kind, ids });
  if (!parsed.success) return invalid();

  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const results = await Promise.all(
    parsed.data.ids.map((itemId, index) =>
      listTable(ctx.supabase, kind)
        .update({ sort_order: index })
        .eq("id", itemId)
        .eq("clinic_id", ctx.clinic.id),
    ),
  );
  const error = results.find((r) => r.error)?.error;
  if (error) return saveError(`ordem ${kind}`, error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Fotos (o navegador envia o arquivo direto para o Storage; aqui só registramos)
// ---------------------------------------------------------------------------------------------

export type ImageResult =
  | {
      ok: true;
      image: { id: string; storage_path: string; description: string };
    }
  | Failure;

export async function createImage(input: {
  storagePath: string;
  originalName: string;
  description: string;
}): Promise<ImageResult> {
  const parsed = imageDescriptionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Descreva quando enviar a foto." };

  const ctx = await getActionContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  // Só aceita arquivos na pasta da própria clínica, com o nome gerado pelo painel.
  const pathPattern = new RegExp(`^${ctx.clinic.id}/[0-9a-f-]{36}\\.jpg$`);
  if (!pathPattern.test(input.storagePath))
    return { ok: false, error: "Arquivo inválido." };

  const { count } = await ctx.supabase
    .from("images")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", ctx.clinic.id);
  if ((count ?? 0) >= MAX_IMAGES) {
    await ctx.supabase.storage
      .from("clinic-images")
      .remove([input.storagePath]);
    return { ok: false, error: `Você pode ter até ${MAX_IMAGES} fotos.` };
  }

  const { data, error } = await ctx.supabase
    .from("images")
    .insert({
      clinic_id: ctx.clinic.id,
      storage_path: input.storagePath,
      original_name: String(input.originalName ?? "").slice(0, 200),
      description: parsed.data.description,
    })
    .select("id, storage_path, description")
    .single();
  if (error) {
    await ctx.supabase.storage
      .from("clinic-images")
      .remove([input.storagePath]);
    console.error("[painel] foto:", error.message);
    return { ok: false, error: "Não foi possível salvar a foto." };
  }
  refresh();
  return { ok: true, image: data };
}

export async function updateImageDescription(
  id: string,
  input: unknown,
): Promise<FormResult> {
  const parsed = imageDescriptionSchema.safeParse(input);
  if (!parsed.success || !idSchema.safeParse(id).success) return invalid();
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await ctx.supabase
    .from("images")
    .update({ description: parsed.data.description })
    .eq("id", id)
    .eq("clinic_id", ctx.clinic.id);
  if (error) return saveError("descrição da foto", error.message);
  refresh();
  return { ok: true };
}

export async function deleteImage(id: string): Promise<FormResult> {
  if (!idSchema.safeParse(id).success) return invalid();
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { data, error } = await ctx.supabase
    .from("images")
    .delete()
    .eq("id", id)
    .eq("clinic_id", ctx.clinic.id)
    .select("storage_path")
    .maybeSingle();
  if (error) return saveError("apagar foto", error.message);
  if (data) {
    const { error: storageError } = await ctx.supabase.storage
      .from("clinic-images")
      .remove([data.storage_path]);
    if (storageError)
      console.error("[painel] arquivo da foto:", storageError.message);
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------------------------

export async function saveProfile(input: unknown): Promise<FormResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const phone = parsed.data.phone.replace(/\D/g, "");
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: phone || null })
    .eq("id", ctx.user.id);
  if (error) return saveError("perfil", error.message);
  refresh();
  return { ok: true };
}

export async function saveClinicName(input: unknown): Promise<FormResult> {
  const parsed = clinicNameSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  if (ctx.clinic.role !== "owner")
    return fail("Só a dona da conta pode mudar o nome da clínica.");
  return updateClinic("nome da clínica", { name: parsed.data.name }, ctx);
}

export async function changePassword(input: unknown): Promise<FormResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { error } = await ctx.supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "same_password")
      return fail("A nova senha precisa ser diferente da atual.");
    if (error.code === "weak_password")
      return fail("Senha fraca: misture letras e números.");
    if (error.code === "reauthentication_needed")
      return fail(
        "Por segurança, saia e entre de novo antes de trocar a senha.",
      );
    return saveError("senha", `${error.code} ${error.message}`);
  }
  return { ok: true };
}
