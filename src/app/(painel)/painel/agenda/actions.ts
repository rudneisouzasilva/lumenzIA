"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import {
  ClinicaExpertsError,
  clinicKey,
  listCeProfessionals,
} from "@/lib/clinica-experts/client";
import { listCalendars, revokeAccount } from "@/lib/google/client";
import { getActionContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";

const fail = (error: string): FormResult => ({ ok: false, error });

// "{conta}::{agenda}" ou null (sem agenda).
const choice = z.string().max(400).nullable();
const calendarsSchema = z.object({
  main: choice,
  professionals: z.record(z.uuid(), choice),
});

type Admin = ReturnType<typeof createAdminClient>;

async function chosenCalendars(admin: Admin, clinicId: string) {
  const [{ data: integration }, { data: professionals }] = await Promise.all([
    admin
      .from("integrations")
      .select("google_calendar_id")
      .eq("clinic_id", clinicId)
      .single()
      .throwOnError(),
    admin
      .from("professionals")
      .select("id")
      .eq("clinic_id", clinicId)
      .not("google_calendar_id", "is", null)
      .throwOnError(),
  ]);
  return (integration.google_calendar_id ? 1 : 0) + professionals.length;
}

/** A agenda principal e a de cada profissional. Confere no Google que a conta vê cada agenda. */
export async function saveGoogleCalendars(input: unknown): Promise<FormResult> {
  const parsed = calendarsSchema.safeParse(input);
  if (!parsed.success) return fail("Escolha as agendas de novo.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from("google_accounts")
    .select("id")
    .eq("clinic_id", ctx.clinic.id)
    .eq("status", "ativo")
    .throwOnError();
  const values = [
    parsed.data.main,
    ...Object.values(parsed.data.professionals),
  ];
  const used = new Set(
    values.filter((v): v is string => Boolean(v)).map((v) => v.split("::")[0]),
  );
  const calendars = new Map<string, Map<string, string>>();
  try {
    for (const accountId of used) {
      if (!accounts.some((a) => a.id === accountId)) {
        return fail("Uma das contas do Google não está mais conectada.");
      }
      const list = await listCalendars(accountId);
      calendars.set(accountId, new Map(list.map((c) => [c.id, c.name])));
    }
  } catch (e) {
    console.error("[agenda] ler agendas do Google:", (e as Error).message);
    return fail("Não foi possível falar com o Google agora. Tente de novo.");
  }

  const resolve = (value: string | null) => {
    if (!value)
      return {
        google_account_id: null,
        google_calendar_id: null,
        google_calendar_name: "",
      };
    const at = value.indexOf("::");
    const accountId = value.slice(0, at);
    const calendarId = value.slice(at + 2);
    const name = calendars.get(accountId)?.get(calendarId);
    if (name === undefined) return null;
    return {
      google_account_id: accountId,
      google_calendar_id: calendarId,
      google_calendar_name: name.slice(0, 200),
    };
  };

  const main = resolve(parsed.data.main);
  if (!main) return fail("A agenda principal não foi encontrada nesta conta.");
  const { data: professionals } = await admin
    .from("professionals")
    .select("id")
    .eq("clinic_id", ctx.clinic.id)
    .throwOnError();

  const updates = [];
  for (const [id, value] of Object.entries(parsed.data.professionals)) {
    if (!professionals.some((p) => p.id === id)) continue;
    const resolved = resolve(value);
    if (!resolved)
      return fail("Uma das agendas não foi encontrada nesta conta.");
    updates.push(
      admin
        .from("professionals")
        .update(resolved)
        .eq("id", id)
        .eq("clinic_id", ctx.clinic.id),
    );
  }
  updates.push(
    admin.from("integrations").update(main).eq("clinic_id", ctx.clinic.id),
  );
  const results = await Promise.all(updates);
  const error = results.find((r) => r.error)?.error;
  if (error) {
    console.error("[agenda] salvar agendas:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }

  // Sem nenhuma agenda escolhida, a assistente deixa de usar o Google.
  if (!(await chosenCalendars(admin, ctx.clinic.id))) {
    await admin
      .from("integrations")
      .update({ enabled: false })
      .eq("clinic_id", ctx.clinic.id)
      .eq("mode", "google");
  }
  refresh();
  return { ok: true };
}

/** Liga ou desliga o Google Agenda como a agenda que a assistente usa. */
export async function setGoogleAgenda(enabled: unknown): Promise<FormResult> {
  if (typeof enabled !== "boolean") return fail("Valor inválido.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();

  if (enabled && !(await chosenCalendars(admin, ctx.clinic.id))) {
    return fail("Escolha pelo menos uma agenda antes de ligar.");
  }
  const { error } = enabled
    ? await admin
        .from("integrations")
        .update({
          mode: "google",
          enabled: true,
          provider_name: "Google Agenda",
        })
        .eq("clinic_id", ctx.clinic.id)
    : await admin
        .from("integrations")
        .update({ enabled: false })
        .eq("clinic_id", ctx.clinic.id)
        .eq("mode", "google");
  if (error) {
    console.error("[agenda] ligar Google:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}

/** Desconecta uma conta do Google: revoga no Google e solta as agendas dela. */
export async function disconnectGoogleAccount(
  id: unknown,
): Promise<FormResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return fail("Conta não encontrada.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();

  const { data: account } = await admin
    .from("google_accounts")
    .select("id")
    .eq("id", parsed.data)
    .eq("clinic_id", ctx.clinic.id)
    .maybeSingle()
    .throwOnError();
  if (!account) return fail("Conta não encontrada.");
  await revokeAccount(account.id).catch((e) =>
    console.error("[agenda] revogar Google:", (e as Error).message),
  );
  await admin
    .from("google_accounts")
    .delete()
    .eq("id", account.id)
    .throwOnError();
  if (!(await chosenCalendars(admin, ctx.clinic.id))) {
    await admin
      .from("integrations")
      .update({ enabled: false })
      .eq("clinic_id", ctx.clinic.id)
      .eq("mode", "google");
  }
  refresh();
  return { ok: true };
}

// --- Clínica Experts ---------------------------------------------------------------------

/** Cola a chave da API: testa na hora (lista os profissionais) e só então guarda no Vault. */
export async function connectClinicaExperts(key: unknown): Promise<FormResult> {
  const parsed = z.string().trim().min(10).max(2000).safeParse(key);
  if (!parsed.success) return fail("Cole a chave de API inteira.");
  const apiKey = parsed.data.replace(/^Bearer\s+/i, "");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  try {
    await listCeProfessionals(apiKey);
  } catch (e) {
    console.error("[agenda] testar Clínica Experts:", (e as Error).message);
    if (
      e instanceof ClinicaExpertsError &&
      (e.status === 401 || e.status === 403)
    ) {
      return fail(
        "O Clínica Experts recusou esta chave. Confira se copiou a chave inteira e se ela está ativa.",
      );
    }
    return fail(
      "Não foi possível falar com o Clínica Experts agora. Tente de novo.",
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("clinica_experts_accounts").upsert(
    {
      clinic_id: ctx.clinic.id,
      status: "ativo",
      last_error: null,
      connected_by: ctx.user.id,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id" },
  );
  const { error: keyError } = error
    ? { error }
    : await admin.rpc("set_clinica_experts_key", {
        p_clinic_id: ctx.clinic.id,
        p_key: apiKey,
      });
  if (keyError) {
    console.error("[agenda] salvar Clínica Experts:", keyError.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}

/** Desconecta: apaga a chave, solta os profissionais e, se estava em uso, desliga a agenda. */
export async function disconnectClinicaExperts(): Promise<FormResult> {
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();
  const cleared = { ce_professional_uuid: null, ce_professional_name: "" };
  const results = await Promise.all([
    admin
      .from("clinica_experts_accounts")
      .delete()
      .eq("clinic_id", ctx.clinic.id),
    admin.from("professionals").update(cleared).eq("clinic_id", ctx.clinic.id),
    admin.from("integrations").update(cleared).eq("clinic_id", ctx.clinic.id),
    admin
      .from("integrations")
      .update({ enabled: false })
      .eq("clinic_id", ctx.clinic.id)
      .eq("mode", "clinica_experts"),
  ]);
  const error = results.find((r) => r.error)?.error;
  if (error) {
    console.error("[agenda] desconectar Clínica Experts:", error.message);
    return fail("Não foi possível desconectar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}

const ceChoice = z.string().max(100).nullable();
const ceProfessionalsSchema = z.object({
  main: ceChoice,
  professionals: z.record(z.uuid(), ceChoice),
});

async function chosenCeProfessionals(admin: Admin, clinicId: string) {
  const [{ data: integration }, { data: professionals }] = await Promise.all([
    admin
      .from("integrations")
      .select("ce_professional_uuid")
      .eq("clinic_id", clinicId)
      .single()
      .throwOnError(),
    admin
      .from("professionals")
      .select("id")
      .eq("clinic_id", clinicId)
      .not("ce_professional_uuid", "is", null)
      .throwOnError(),
  ]);
  return (integration.ce_professional_uuid ? 1 : 0) + professionals.length;
}

/** Qual profissional do Clínica Experts é cada profissional daqui (e o principal). */
export async function saveClinicaExpertsProfessionals(
  input: unknown,
): Promise<FormResult> {
  const parsed = ceProfessionalsSchema.safeParse(input);
  if (!parsed.success) return fail("Escolha os profissionais de novo.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();

  let names: Map<string, string>;
  try {
    const key = await clinicKey(ctx.clinic.id);
    if (!key) return fail("Conecte o Clínica Experts primeiro.");
    names = new Map(
      (await listCeProfessionals(key)).map((p) => [p.uuid, p.name]),
    );
  } catch (e) {
    console.error(
      "[agenda] ler profissionais do Clínica Experts:",
      (e as Error).message,
    );
    return fail(
      "Não foi possível falar com o Clínica Experts agora. Tente de novo.",
    );
  }
  const resolve = (uuid: string | null) => {
    if (!uuid) return { ce_professional_uuid: null, ce_professional_name: "" };
    const name = names.get(uuid);
    if (name === undefined) return null;
    return {
      ce_professional_uuid: uuid,
      ce_professional_name: name.slice(0, 200),
    };
  };

  const main = resolve(parsed.data.main);
  if (!main)
    return fail(
      "O profissional principal não foi encontrado no Clínica Experts.",
    );
  const { data: professionals } = await admin
    .from("professionals")
    .select("id")
    .eq("clinic_id", ctx.clinic.id)
    .throwOnError();
  const updates = [];
  for (const [id, uuid] of Object.entries(parsed.data.professionals)) {
    if (!professionals.some((p) => p.id === id)) continue;
    const resolved = resolve(uuid);
    if (!resolved)
      return fail(
        "Um dos profissionais não foi encontrado no Clínica Experts.",
      );
    updates.push(
      admin
        .from("professionals")
        .update(resolved)
        .eq("id", id)
        .eq("clinic_id", ctx.clinic.id),
    );
  }
  updates.push(
    admin.from("integrations").update(main).eq("clinic_id", ctx.clinic.id),
  );
  const results = await Promise.all(updates);
  const error = results.find((r) => r.error)?.error;
  if (error) {
    console.error(
      "[agenda] salvar profissionais do Clínica Experts:",
      error.message,
    );
    return fail("Não foi possível salvar agora. Tente de novo.");
  }

  // Sem nenhum profissional escolhido, a assistente deixa de usar o Clínica Experts.
  if (!(await chosenCeProfessionals(admin, ctx.clinic.id))) {
    await admin
      .from("integrations")
      .update({ enabled: false })
      .eq("clinic_id", ctx.clinic.id)
      .eq("mode", "clinica_experts");
  }
  refresh();
  return { ok: true };
}

/** Liga ou desliga o Clínica Experts como a agenda que a assistente usa. */
export async function setClinicaExpertsAgenda(
  enabled: unknown,
): Promise<FormResult> {
  if (typeof enabled !== "boolean") return fail("Valor inválido.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();

  if (enabled) {
    const { data: account } = await admin
      .from("clinica_experts_accounts")
      .select("status")
      .eq("clinic_id", ctx.clinic.id)
      .maybeSingle()
      .throwOnError();
    if (account?.status !== "ativo")
      return fail("Conecte o Clínica Experts primeiro.");
    if (!(await chosenCeProfessionals(admin, ctx.clinic.id))) {
      return fail("Escolha pelo menos um profissional antes de ligar.");
    }
  }
  const { error } = enabled
    ? await admin
        .from("integrations")
        .update({
          mode: "clinica_experts",
          enabled: true,
          provider_name: "Clínica Experts",
        })
        .eq("clinic_id", ctx.clinic.id)
    : await admin
        .from("integrations")
        .update({ enabled: false })
        .eq("clinic_id", ctx.clinic.id)
        .eq("mode", "clinica_experts");
  if (error) {
    console.error("[agenda] ligar Clínica Experts:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}
