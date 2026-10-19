"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getAdminActionContext } from "@/lib/admin/context";
import {
  agendaSchema,
  parseActionsConfig,
  templatesSchema,
  whatsappTechSchema,
} from "@/lib/admin/validation";
import type { FormResult } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { disconnectWhatsapp } from "@/lib/whatsapp/embedded-signup";

/**
 * Ações da equipe LumenzIA. Cada uma confere de novo que quem chama é admin, grava com a chave
 * secreta (as colunas técnicas não aceitam escrita do navegador) e registra na auditoria o que
 * mudou, sem nunca guardar o valor de um segredo.
 */

const fail = (error: string): FormResult => ({ ok: false, error });
const clinicIdSchema = z.uuid();

type Admin = ReturnType<typeof createAdminClient>;

async function start(
  clinicId: unknown,
): Promise<
  { error: string } | { userId: string; clinicId: string; admin: Admin }
> {
  const ctx = await getAdminActionContext();
  if ("error" in ctx) return { error: ctx.error };
  const id = clinicIdSchema.safeParse(clinicId);
  if (!id.success) return { error: "Clínica inválida." };
  return { userId: ctx.user.id, clinicId: id.data, admin: createAdminClient() };
}

async function audit(
  admin: Admin,
  adminId: string,
  clinicId: string | null,
  action: string,
  details: string,
) {
  const { error } = await admin
    .from("admin_audit_log")
    .insert({ admin_id: adminId, clinic_id: clinicId, action, details });
  if (error) console.error("[admin] auditoria:", error.message);
}

/** "campo: antes → depois" só do que mudou. */
function diff(
  labels: Record<string, string>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const show = (v: unknown) =>
    v == null || v === ""
      ? "vazio"
      : typeof v === "object"
        ? "JSON"
        : String(v);
  return Object.keys(labels)
    .filter(
      (k) =>
        JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
    )
    .map((k) =>
      typeof after[k] === "object" && after[k] !== null
        ? `${labels[k]} alterado`
        : `${labels[k]}: ${show(before[k])} → ${show(after[k])}`,
    );
}

const saveError = (where: string, message: string) => {
  console.error(`[admin] ${where}:`, message);
  return fail("Não foi possível salvar agora. Tente de novo.");
};

export async function saveClinicWhatsapp(
  clinicId: unknown,
  input: unknown,
): Promise<FormResult> {
  const ctx = await start(clinicId);
  if ("error" in ctx) return fail(ctx.error);
  const parsed = whatsappTechSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const v = parsed.data;

  const { data: before, error: readError } = await ctx.admin
    .from("clinics")
    .select(
      "whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_display_phone, staff_phone_number",
    )
    .eq("id", ctx.clinicId)
    .single();
  if (readError) return saveError("ler whatsapp", readError.message);

  const after = {
    whatsapp_phone_number_id: v.phoneNumberId || null,
    whatsapp_waba_id: v.wabaId || null,
    whatsapp_display_phone: v.displayPhone || null,
    staff_phone_number: v.staffPhone || null,
  };
  const { error } = await ctx.admin
    .from("clinics")
    .update({
      ...after,
      // Número trocado ou removido: a assistente pausa até alguém conferir e ligar de novo.
      ...(after.whatsapp_phone_number_id !== before.whatsapp_phone_number_id
        ? {
            is_active: false,
            whatsapp_connected_at: after.whatsapp_phone_number_id
              ? new Date().toISOString()
              : null,
            whatsapp_verified_name: null,
          }
        : {}),
    })
    .eq("id", ctx.clinicId);
  if (error?.code === "23505") {
    return fail("Este Phone Number ID já está em outra clínica.");
  }
  if (error) return saveError("salvar whatsapp", error.message);

  const changes = diff(
    {
      whatsapp_phone_number_id: "Phone Number ID",
      whatsapp_waba_id: "WABA",
      whatsapp_display_phone: "número exibido",
      staff_phone_number: "WhatsApp da equipe",
    },
    before,
    after,
  );
  if (v.token || v.removeToken) {
    const { error: secretError } = await ctx.admin.rpc("set_clinic_secret", {
      p_clinic_id: ctx.clinicId,
      p_kind: "whatsapp_token",
      p_value: v.removeToken ? "" : v.token,
    });
    if (secretError) return saveError("token whatsapp", secretError.message);
    changes.push(v.removeToken ? "token removido" : "token trocado");
  }

  if (changes.length) {
    await audit(
      ctx.admin,
      ctx.userId,
      ctx.clinicId,
      "whatsapp.editado",
      changes.join("; "),
    );
  }
  refresh();
  return { ok: true };
}

export async function saveClinicTemplates(
  clinicId: unknown,
  input: unknown,
): Promise<FormResult> {
  const ctx = await start(clinicId);
  if ("error" in ctx) return fail(ctx.error);
  const parsed = templatesSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const v = parsed.data;

  const { data: before, error: readError } = await ctx.admin
    .from("clinics")
    .select(
      "reminder_template_name, staff_alert_template_name, template_language",
    )
    .eq("id", ctx.clinicId)
    .single();
  if (readError) return saveError("ler templates", readError.message);

  const after = {
    reminder_template_name: v.reminderTemplate || null,
    staff_alert_template_name: v.staffAlertTemplate || null,
    template_language: v.language,
  };
  const { error } = await ctx.admin
    .from("clinics")
    .update(after)
    .eq("id", ctx.clinicId);
  if (error) return saveError("salvar templates", error.message);

  const changes = diff(
    {
      reminder_template_name: "lembrete",
      staff_alert_template_name: "aviso à equipe",
      template_language: "idioma",
    },
    before,
    after,
  );
  if (changes.length) {
    await audit(
      ctx.admin,
      ctx.userId,
      ctx.clinicId,
      "templates.editado",
      changes.join("; "),
    );
  }
  refresh();
  return { ok: true };
}

export async function saveClinicAgenda(
  clinicId: unknown,
  input: unknown,
): Promise<FormResult> {
  const ctx = await start(clinicId);
  if ("error" in ctx) return fail(ctx.error);
  const parsed = agendaSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Confira os campos destacados.",
    );
  }
  const v = parsed.data;
  const config = parseActionsConfig(v.actionsConfig);
  if (!config.ok) return fail(config.error);

  const { data: before, error: readError } = await ctx.admin
    .from("integrations")
    .select("provider_name, mode, webhook_url, actions_config, enabled")
    .eq("clinic_id", ctx.clinicId)
    .single();
  if (readError) return saveError("ler agenda", readError.message);

  const after = {
    provider_name: v.providerName,
    mode: v.mode,
    webhook_url: v.webhookUrl || null,
    actions_config: config.value as Json,
    enabled: v.enabled,
  };
  const { error } = await ctx.admin
    .from("integrations")
    .update(after)
    .eq("clinic_id", ctx.clinicId);
  if (error) return saveError("salvar agenda", error.message);

  const changes = diff(
    {
      provider_name: "sistema",
      mode: "modo",
      webhook_url: "webhook",
      actions_config: "ações",
      enabled: "ativa",
    },
    before,
    after,
  );
  if (v.apiKey || v.removeApiKey) {
    const { error: secretError } = await ctx.admin.rpc("set_clinic_secret", {
      p_clinic_id: ctx.clinicId,
      p_kind: "agenda_api_key",
      p_value: v.removeApiKey ? "" : v.apiKey,
    });
    if (secretError) return saveError("chave da agenda", secretError.message);
    changes.push(v.removeApiKey ? "chave removida" : "chave trocada");
  }

  if (changes.length) {
    await audit(
      ctx.admin,
      ctx.userId,
      ctx.clinicId,
      "agenda.editada",
      changes.join("; "),
    );
  }
  refresh();
  return { ok: true };
}

export async function setClinicAssistant(
  clinicId: unknown,
  active: boolean,
): Promise<FormResult> {
  const ctx = await start(clinicId);
  if ("error" in ctx) return fail(ctx.error);
  if (active) {
    const { data } = await ctx.admin
      .from("clinics")
      .select("whatsapp_phone_number_id")
      .eq("id", ctx.clinicId)
      .single();
    if (!data?.whatsapp_phone_number_id) {
      return fail("A clínica ainda não tem WhatsApp conectado.");
    }
  }
  const { error } = await ctx.admin
    .from("clinics")
    .update({ is_active: Boolean(active) })
    .eq("id", ctx.clinicId);
  if (error) return saveError("assistente", error.message);
  await audit(
    ctx.admin,
    ctx.userId,
    ctx.clinicId,
    active ? "assistente.ligada" : "assistente.pausada",
    active ? "Ligada pela equipe." : "Pausada pela equipe.",
  );
  refresh();
  return { ok: true };
}

export async function adminDisconnectWhatsapp(
  clinicId: unknown,
): Promise<FormResult> {
  const ctx = await start(clinicId);
  if ("error" in ctx) return fail(ctx.error);
  try {
    await disconnectWhatsapp(ctx.clinicId, {
      userId: ctx.userId,
      reason: "Desconectado pela equipe LumenzIA",
    });
  } catch (e) {
    return saveError("desconectar whatsapp", (e as Error).message);
  }
  refresh();
  return { ok: true };
}

/** Aponta os jobs do pg_cron para NEXT_PUBLIC_APP_URL (ao trocar para o domínio próprio). */
export async function syncCronAppUrl(): Promise<FormResult> {
  const ctx = await getAdminActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (!url?.startsWith("https://")) {
    return fail("Defina NEXT_PUBLIC_APP_URL com https:// na Vercel primeiro.");
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_cron_app_url", { p_url: url });
  if (error) return saveError("endereço dos jobs", error.message);
  await audit(
    admin,
    ctx.user.id,
    null,
    "jobs.endereco",
    `Jobs passam a chamar ${url}.`,
  );
  refresh();
  return { ok: true };
}
