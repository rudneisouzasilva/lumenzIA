"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import { getActionContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import {
  placeholderCount,
  TEMPLATE_PACK,
  templateBodyProblem,
} from "@/lib/whatsapp/template-pack";
import {
  ensureTemplatePack,
  submitTemplate,
  syncTemplates,
} from "@/lib/whatsapp/templates";

const fail = (error: string): FormResult => ({ ok: false, error });

const templateSchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().max(60),
  category: z.enum(["MARKETING", "UTILITY"]),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().max(60),
  example: z.array(z.string().trim().max(200)).max(20),
});

/** "Promoção de Natal" → "clinica_promocao_de_natal" (nome aceito pela Meta). */
function templateName(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return slug ? `clinica_${slug}` : null;
}

/** Cria o pacote de mensagens prontas que faltar e manda para a aprovação da Meta. */
export async function createTemplatePackAction(): Promise<FormResult> {
  const ctx = await getActionContext("mensagens");
  if ("error" in ctx) return fail(ctx.error);
  try {
    const errors = await ensureTemplatePack(ctx.clinic.id);
    refresh();
    return errors.length ? fail(errors[0]) : { ok: true };
  } catch (e) {
    console.error("[mensagens] pacote:", (e as Error).message);
    return fail("Não foi possível criar as mensagens agora. Tente de novo.");
  }
}

/** Atualiza o status de todas com a Meta e traz as que a clínica criou por lá. */
export async function syncTemplatesAction(): Promise<FormResult> {
  const ctx = await getActionContext("mensagens");
  if ("error" in ctx) return fail(ctx.error);
  try {
    const error = await syncTemplates(ctx.clinic.id);
    refresh();
    return error ? fail(error) : { ok: true };
  } catch (e) {
    console.error("[mensagens] sincronizar:", (e as Error).message);
    return fail("Não foi possível sincronizar agora. Tente de novo.");
  }
}

/**
 * Salva o texto de uma mensagem pronta (nova ou existente) e manda para a aprovação da Meta.
 * Editar uma aprovada volta para "em análise" até a Meta aprovar de novo.
 */
export async function saveTemplateAction(input: unknown): Promise<FormResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const v = parsed.data;
  const problem = templateBodyProblem(v.body);
  if (problem) return fail(problem);
  if (v.example.slice(0, placeholderCount(v.body)).some((e) => !e)) {
    return fail("Dê um exemplo para cada variável: a Meta exige.");
  }

  const ctx = await getActionContext("mensagens");
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();

  let row;
  let previous: Pick<
    Tables<"message_templates">,
    "body" | "footer" | "example" | "meta_template_id"
  > | null = null;
  if (v.id) {
    const { data: current } = await admin
      .from("message_templates")
      .select("purpose, body, footer, example, meta_template_id")
      .eq("id", v.id)
      .eq("clinic_id", ctx.clinic.id)
      .maybeSingle();
    if (!current) return fail("Esta mensagem não existe mais.");
    // As mensagens que a assistente envia sozinha recebem um número fixo de variáveis.
    const known = TEMPLATE_PACK.find((t) => t.purpose === current.purpose);
    if (known && placeholderCount(v.body) > known.params.length) {
      return fail(
        `Esta mensagem aceita no máximo ${known.params.length} variáveis: ${known.params.join(", ")}.`,
      );
    }
    previous = current;
    const { data, error } = await admin
      .from("message_templates")
      .update({ body: v.body, footer: v.footer, example: v.example })
      .eq("id", v.id)
      .eq("clinic_id", ctx.clinic.id)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[mensagens] salvar:", error.message);
      return fail("Não foi possível salvar agora. Tente de novo.");
    }
    if (!data) return fail("Esta mensagem não existe mais.");
    row = data;
  } else {
    const name = templateName(v.title);
    if (!name) return fail("Dê um nome à mensagem.");
    const { data, error } = await admin
      .from("message_templates")
      .insert({
        clinic_id: ctx.clinic.id,
        name,
        category: v.category,
        body: v.body,
        footer: v.footer,
        example: v.example,
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      return fail("Já existe uma mensagem com este nome.");
    }
    if (error) {
      console.error("[mensagens] criar:", error.message);
      return fail("Não foi possível salvar agora. Tente de novo.");
    }
    row = data;
  }

  const submitError = await submitTemplate(row);
  // A Meta recusou a edição de uma que já existe lá: o texto volta a ser o que ela conhece.
  if (submitError && previous?.meta_template_id) {
    await admin
      .from("message_templates")
      .update({
        body: previous.body,
        footer: previous.footer,
        example: previous.example,
      })
      .eq("id", row.id);
  }
  refresh();
  return submitError ? fail(submitError) : { ok: true };
}
