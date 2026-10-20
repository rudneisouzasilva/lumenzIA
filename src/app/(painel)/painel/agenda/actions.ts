"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
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
