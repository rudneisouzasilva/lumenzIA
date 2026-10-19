import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  brasiliaToUtc,
  callAgenda,
  durationFor,
  type AgendaResult,
  type Integration,
} from "@/lib/ai/agenda";
import { isoDateInBrasilia } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { deadline } from "./cron";

type Admin = SupabaseClient<Database>;

type ExternalAppointment = {
  id?: unknown;
  nome_paciente?: unknown;
  telefone?: unknown;
  procedimento?: unknown;
  profissional?: unknown;
  data_hora?: unknown;
};

/**
 * Lê o resultado de "listar_agendamentos" em dois formatos:
 *  - o da LumenzIA: uma lista, ou { agendamentos: [...] }, com itens
 *    { id, nome_paciente, telefone, procedimento, profissional, data_hora };
 *  - o do Google Calendar (events.list): { items: [...] }, com o título "Procedimento - Nome" e
 *    "Telefone: 5541999999999." na descrição (o mesmo formato que usamos para criar o evento).
 */
export function normalizeAgendaList(
  result: AgendaResult,
): ExternalAppointment[] {
  if (Array.isArray(result.agendamentos))
    return result.agendamentos as ExternalAppointment[];
  if (Array.isArray(result.items)) {
    return (result.items as Record<string, unknown>[]).map((ev) => {
      const summary = String(ev.summary ?? "");
      const sep = summary.indexOf(" - ");
      const phone = /Telefone:\s*([^\s.]+)/.exec(String(ev.description ?? ""));
      const start = ev.start as { dateTime?: string; date?: string } | null;
      const startIso = start?.dateTime ?? start?.date;
      return {
        id: ev.id,
        nome_paciente: sep === -1 ? summary : summary.slice(sep + 3),
        procedimento: sep === -1 ? "" : summary.slice(0, sep),
        telefone: phone?.[1] ?? "",
        data_hora: startIso ? startIso.slice(0, 16) : null,
      };
    });
  }
  return [];
}

/** Agendamentos da agenda da clínica entre duas datas (AAAA-MM-DD), ou o erro. */
export async function listExternalAgenda(
  integration: Integration,
  from: string,
  to: string,
) {
  const result = await callAgenda(integration, [], "listar_agendamentos", {
    data_inicio: from,
    data_fim: to,
  });
  if (result.erro) return { list: null, erro: String(result.erro) };
  return { list: normalizeAgendaList(result), erro: null };
}

const text = (v: unknown) => (v == null ? "" : String(v));

/**
 * Cria ou atualiza a cópia local de um agendamento da agenda externa: pelo id quando existe,
 * senão por telefone + horário. Não mexe em reminder_sent_at, para não repetir um lembrete.
 */
async function upsertAppointment(
  admin: Admin,
  clinicId: string,
  services: { name: string; duration_minutes: number }[],
  item: ExternalAppointment,
) {
  const startsAt = brasiliaToUtc(item.data_hora);
  if (!startsAt) return false;
  const minutes = durationFor(services, item.procedimento);
  const ref = item.id == null || item.id === "" ? null : String(item.id);
  const phone = text(item.telefone).replace(/\D/g, "");
  const values = {
    patient_name: text(item.nome_paciente),
    procedure_name: text(item.procedimento),
    professional_name: text(item.profissional),
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
    status: "agendado" as const,
  };

  let existing = admin
    .from("appointments")
    .select("id")
    .eq("clinic_id", clinicId);
  existing = ref
    ? existing.eq("external_ref", ref)
    : existing.eq("contact_phone", phone).eq("starts_at", values.starts_at);
  const { data } = await existing.limit(1).maybeSingle().throwOnError();

  if (data) {
    await admin
      .from("appointments")
      .update(values)
      .eq("id", data.id)
      .throwOnError();
  } else {
    await admin
      .from("appointments")
      .insert({
        ...values,
        clinic_id: clinicId,
        contact_phone: phone,
        external_ref: ref,
      })
      .throwOnError();
  }
  return true;
}

/**
 * Traz para a cópia local os agendamentos dos próximos dias de uma clínica, inclusive os que a
 * equipe marcou direto na agenda (sem a IA): é a cópia local que o lembrete usa. O que tinha id
 * da agenda e sumiu dela foi cancelado lá, então é cancelado aqui também.
 */
async function syncClinic(admin: Admin, integration: Integration) {
  const hoursAhead = Math.max(24, integration.reminder_hours_before);
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3600_000);
  const { list, erro } = await listExternalAgenda(
    integration,
    isoDateInBrasilia(now),
    isoDateInBrasilia(until),
  );
  if (!list) return { synced: 0, cancelled: 0, erro };

  const { data: services } = await admin
    .from("services")
    .select("name, duration_minutes")
    .eq("clinic_id", integration.clinic_id)
    .throwOnError();

  let synced = 0;
  const seen: string[] = [];
  for (const item of list) {
    if (item.id != null && item.id !== "") seen.push(String(item.id));
    try {
      if (await upsertAppointment(admin, integration.clinic_id, services, item))
        synced++;
    } catch (e) {
      console.error(
        `[agenda] clínica ${integration.clinic_id}:`,
        (e as Error).message,
      );
    }
  }

  let gone = admin
    .from("appointments")
    .update({ status: "cancelado" })
    .eq("clinic_id", integration.clinic_id)
    .eq("status", "agendado")
    .not("external_ref", "is", null)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString());
  if (seen.length) {
    gone = gone.not(
      "external_ref",
      "in",
      `(${seen.map((r) => `"${r.replaceAll('"', '""')}"`).join(",")})`,
    );
  }
  const { data: cancelled } = await gone.select("id").throwOnError();
  return { synced, cancelled: cancelled.length, erro: null };
}

/** Sincroniza todas as clínicas com a agenda conectada e a assistente ligada (1x por dia). */
export async function runAgendaSync(budgetMs: number) {
  const admin = createAdminClient();
  const { data: integrations } = await admin
    .from("integrations")
    .select("*, clinics!inner(is_active)")
    .eq("enabled", true)
    .eq("clinics.is_active", true)
    .throwOnError();

  const hasTime = deadline(budgetMs);
  let synced = 0;
  let appointments = 0;
  for (const row of integrations) {
    const { clinics, ...integration } = row;
    void clinics; // só filtrou as clínicas com a assistente ligada
    if (!hasTime()) break;
    try {
      const result = await syncClinic(admin, integration);
      synced++;
      appointments += result.synced;
      if (result.erro) {
        console.warn(
          `[agenda] clínica ${integration.clinic_id}: ${result.erro}`,
        );
      }
    } catch (e) {
      console.error(
        `[agenda] clínica ${integration.clinic_id}:`,
        (e as Error).message,
      );
    }
  }
  return { clinics: synced, appointments };
}
