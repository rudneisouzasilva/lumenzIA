import "server-only";

import { calendarApi, GoogleError } from "@/lib/google/client";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  brasiliaToUtc,
  durationFor,
  utcToBrasilia,
  type AgendaResult,
  type Integration,
} from "./agenda";
import { nationalHolidayOn } from "./holidays";

/**
 * As ações da agenda no modo "google": a clínica conectou as próprias contas e escolheu uma agenda
 * por profissional (e uma principal). Os eventos seguem o mesmo formato da conta de serviço:
 * título "Procedimento - Nome" e "Telefone: 5541999999999." na descrição. O id que a IA vê é
 * "{agenda}::{evento}", para saber em qual agenda cancelar.
 */

type Target = {
  accountId: string;
  calendarId: string;
  professional: string | null;
};

type Clinic = {
  work_days: number[];
  work_hours_start: string | null;
  work_hours_end: string | null;
  works_on_holidays: boolean;
};

const SLOT_STEP_MINUTES = 30;
const MAX_DAYS = 14;
const SLOTS_PER_DAY = 4;
const MAX_SLOTS = 12;
const MIN_NOTICE_MS = 60 * 60_000;
const LOOKAHEAD_DAYS = 180;
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];
const TZ = "America/Sao_Paulo";

const text = (v: unknown) => (v == null ? "" : String(v).trim());
const digits = (v: unknown) => text(v).replace(/\D/g, "");

/** As agendas da clínica: a de cada profissional e a principal (sem profissional). */
async function loadTargets(integration: Integration) {
  const admin = createAdminClient();
  const [{ data: professionals }, { data: clinic }, { data: accounts }] =
    await Promise.all([
      admin
        .from("professionals")
        .select("name, google_account_id, google_calendar_id")
        .eq("clinic_id", integration.clinic_id)
        .order("sort_order")
        .throwOnError(),
      admin
        .from("clinics")
        .select(
          "work_days, work_hours_start, work_hours_end, works_on_holidays",
        )
        .eq("id", integration.clinic_id)
        .single()
        .throwOnError(),
      admin
        .from("google_accounts")
        .select("id")
        .eq("clinic_id", integration.clinic_id)
        .eq("status", "ativo")
        .throwOnError(),
    ]);
  const active = new Set(accounts.map((a) => a.id));
  const targets: Target[] = professionals
    .filter(
      (p) =>
        p.google_account_id &&
        p.google_calendar_id &&
        active.has(p.google_account_id),
    )
    .map((p) => ({
      accountId: p.google_account_id!,
      calendarId: p.google_calendar_id!,
      professional: p.name,
    }));
  const main =
    integration.google_account_id &&
    integration.google_calendar_id &&
    active.has(integration.google_account_id)
      ? {
          accountId: integration.google_account_id,
          calendarId: integration.google_calendar_id,
          professional: null,
        }
      : null;
  return { targets, main, clinic };
}

/** As agendas onde procurar: a do profissional pedido, ou todas. */
function pick(
  { targets, main }: Awaited<ReturnType<typeof loadTargets>>,
  professional: unknown,
): Target[] | { erro: string } {
  const wanted = text(professional).toLowerCase();
  if (wanted) {
    const found = targets.find(
      (t) => t.professional!.trim().toLowerCase() === wanted,
    );
    if (found) return [found];
    if (main) return [main];
    return {
      erro: `Não há agenda do Google escolhida para "${text(professional)}". Use o nome exato de um dos profissionais cadastrados.`,
    };
  }
  const all = main ? [...targets, main] : targets;
  if (!all.length) {
    return {
      erro: "A clínica ainda não escolheu as agendas do Google para a assistente usar.",
    };
  }
  return all;
}

const eventPath = (calendarId: string, eventId = "") =>
  `calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function toItem(target: Target, ev: GoogleEvent) {
  const summary = text(ev.summary);
  const sep = summary.indexOf(" - ");
  const phone = /Telefone:\s*([^\s.]+)/.exec(text(ev.description));
  const start = ev.start?.dateTime;
  return {
    id: `${target.calendarId}::${ev.id}`,
    nome_paciente: sep === -1 ? summary : summary.slice(sep + 3),
    procedimento: sep === -1 ? "" : summary.slice(0, sep),
    telefone: phone?.[1]?.replace(/\D/g, "") ?? "",
    profissional: target.professional ?? "",
    data_hora: start ? utcToBrasilia(new Date(start)) : null,
  };
}

/** O evento é deste telefone? (o mesmo DDD e número, com ou sem o 55 e o nono dígito) */
function samePhone(a: string, b: string) {
  const key = (s: string) => {
    const local = s.length >= 12 && s.startsWith("55") ? s.slice(2) : s;
    return local.length >= 10 ? local.slice(0, 2) + local.slice(-8) : local;
  };
  if (!a || !b) return false;
  return key(a) === key(b);
}

async function listEvents(
  target: Target,
  from: Date,
  to: Date,
  query?: Record<string, string>,
) {
  const res = await calendarApi<{ items?: GoogleEvent[] }>(
    target.accountId,
    eventPath(target.calendarId),
    {
      query: {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        ...query,
      },
    },
  );
  return (res.items ?? []).filter(
    (ev) => ev.status !== "cancelled" && ev.start?.dateTime,
  );
}

/** Horários ocupados de várias agendas, agrupando por conta (uma chamada por conta). */
async function busyTimes(targets: Target[], from: Date, to: Date) {
  const busy = new Map<string, { start: number; end: number }[]>();
  const byAccount = new Map<string, Target[]>();
  for (const t of targets) {
    byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t]);
  }
  for (const [accountId, list] of byAccount) {
    const res = await calendarApi<{
      calendars?: Record<
        string,
        { busy?: { start: string; end: string }[]; errors?: unknown[] }
      >;
    }>(accountId, "freeBusy", {
      method: "POST",
      body: {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        timeZone: TZ,
        items: list.map((t) => ({ id: t.calendarId })),
      },
    });
    for (const t of list) {
      const cal = res.calendars?.[t.calendarId];
      if (cal?.errors?.length) {
        throw new GoogleError(`sem acesso à agenda ${t.calendarId}`, 403);
      }
      busy.set(
        t.calendarId,
        (cal?.busy ?? []).map((b) => ({
          start: Date.parse(b.start),
          end: Date.parse(b.end),
        })),
      );
    }
  }
  return busy;
}

/** Os dias (AAAA-MM-DD) entre duas datas, no máximo MAX_DAYS. */
function days(from: string, to: string) {
  const out: string[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (
    let d = start;
    d <= end && out.length < MAX_DAYS;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Os horários de início possíveis de um dia, pelo expediente da clínica. */
function daySlots(day: string, clinic: Clinic, minutes: number) {
  const noon = new Date(`${day}T15:00:00Z`); // meio-dia em Brasília
  const weekday = ((noon.getUTCDay() + 6) % 7) + 1;
  const workDays = clinic.work_days.length ? clinic.work_days : DEFAULT_DAYS;
  if (!workDays.includes(weekday)) return [];
  if (!clinic.works_on_holidays && nationalHolidayOn(noon)) return [];
  const open = brasiliaToUtc(
    `${day}T${(clinic.work_hours_start ?? "09:00").slice(0, 5)}`,
  )!;
  const close = brasiliaToUtc(
    `${day}T${(clinic.work_hours_end ?? "18:00").slice(0, 5)}`,
  )!;
  const slots: Date[] = [];
  for (
    let t = open.getTime();
    t + minutes * 60_000 <= close.getTime();
    t += SLOT_STEP_MINUTES * 60_000
  ) {
    slots.push(new Date(t));
  }
  return slots;
}

const overlaps = (
  busy: { start: number; end: number }[],
  start: number,
  end: number,
) => busy.some((b) => b.start < end && b.end > start);

async function availability(
  loaded: Awaited<ReturnType<typeof loadTargets>>,
  services: { name: string; duration_minutes: number }[],
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const chosen = pick(loaded, params.profissional);
  if ("erro" in chosen) return chosen;
  const from = text(params.data_inicio).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { erro: "Informe data_inicio no formato AAAA-MM-DD." };
  }
  const toParam = text(params.data_fim).slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam)
    ? toParam
    : new Date(Date.parse(`${from}T12:00:00Z`) + 6 * 86_400_000)
        .toISOString()
        .slice(0, 10);
  const minutes = durationFor(services, params.procedimento);
  const list = days(from, to);
  if (!list.length) return { erro: "Período inválido." };

  const rangeStart = brasiliaToUtc(`${list[0]}T00:00`)!;
  const rangeEnd = brasiliaToUtc(`${list[list.length - 1]}T23:59`)!;
  const busy = await busyTimes(chosen, rangeStart, rangeEnd);
  const earliest = Date.now() + MIN_NOTICE_MS;

  const free: { profissional: string; data_hora: string }[] = [];
  for (const target of chosen) {
    const taken = busy.get(target.calendarId) ?? [];
    let count = 0;
    for (const day of list) {
      let perDay = 0;
      for (const slot of daySlots(day, loaded.clinic, minutes)) {
        const start = slot.getTime();
        if (start < earliest) continue;
        if (overlaps(taken, start, start + minutes * 60_000)) continue;
        free.push({
          profissional: target.professional ?? "",
          data_hora: utcToBrasilia(slot),
        });
        count++;
        if (++perDay >= SLOTS_PER_DAY || count >= MAX_SLOTS) break;
      }
      if (count >= MAX_SLOTS) break;
    }
  }
  return {
    duracao_minutos: minutes,
    horarios_livres: free,
    ...(free.length
      ? {}
      : { aviso: "Nenhum horário livre neste período. Ofereça outras datas." }),
  };
}

async function create(
  loaded: Awaited<ReturnType<typeof loadTargets>>,
  services: { name: string; duration_minutes: number }[],
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const chosen = pick(loaded, params.profissional);
  if ("erro" in chosen) return chosen;
  const target = chosen[0];
  const start = brasiliaToUtc(params.data_hora);
  if (!start) return { erro: "Informe data_hora no formato AAAA-MM-DDTHH:mm." };
  if (start.getTime() < Date.now()) {
    return { erro: "Este horário já passou." };
  }
  const minutes = durationFor(services, params.procedimento);
  const end = new Date(start.getTime() + minutes * 60_000);
  const busy = await busyTimes([target], start, end);
  if (
    overlaps(busy.get(target.calendarId) ?? [], start.getTime(), end.getTime())
  ) {
    return {
      erro: "Este horário acabou de ser ocupado. Consulte a disponibilidade de novo e ofereça outro.",
    };
  }

  const phone = digits(params.telefone);
  const notes = text(params.observacoes);
  const event = await calendarApi<GoogleEvent>(
    target.accountId,
    eventPath(target.calendarId),
    {
      method: "POST",
      body: {
        summary: `${text(params.procedimento) || "Atendimento"} - ${text(params.nome_paciente)}`,
        description: [
          `Telefone: ${phone}.`,
          notes ? `Observações: ${notes}` : "",
          "Agendado pela assistente LumenzIA no WhatsApp.",
        ]
          .filter(Boolean)
          .join("\n"),
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end: { dateTime: end.toISOString(), timeZone: TZ },
        extendedProperties: { private: { lumenzia: "1", telefone: phone } },
      },
    },
  );
  return {
    ok: true,
    id: `${target.calendarId}::${event.id}`,
    data_hora: utcToBrasilia(start),
    duracao_minutos: minutes,
    profissional: target.professional ?? "",
  };
}

async function find(
  loaded: Awaited<ReturnType<typeof loadTargets>>,
  params: Record<string, unknown>,
) {
  const chosen = pick(loaded, params.profissional);
  if ("erro" in chosen) return chosen;
  const phone = digits(params.telefone);
  if (!phone) return { erro: "Telefone não informado." };
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);
  const found: ReturnType<typeof toItem>[] = [];
  for (const target of chosen) {
    // Os eventos criados pela assistente guardam o telefone; os criados à mão, só no texto.
    const [tagged, typed] = await Promise.all([
      listEvents(target, now, until, {
        privateExtendedProperty: `telefone=${phone}`,
      }),
      listEvents(target, now, until, { q: phone }),
    ]);
    const seen = new Set<string>();
    for (const ev of [...tagged, ...typed]) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      const item = toItem(target, ev);
      if (samePhone(item.telefone, phone)) found.push(item);
    }
    found.sort((a, b) => (a.data_hora ?? "").localeCompare(b.data_hora ?? ""));
  }
  return found;
}

async function cancel(
  loaded: Awaited<ReturnType<typeof loadTargets>>,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const phone = digits(params.telefone);
  const all = [...loaded.targets, ...(loaded.main ? [loaded.main] : [])];
  let calendarId: string;
  let eventId: string;
  const ref = text(params.agendamento_id);
  if (ref.includes("::")) {
    [calendarId, eventId] = [
      ref.slice(0, ref.lastIndexOf("::")),
      ref.slice(ref.lastIndexOf("::") + 2),
    ];
  } else {
    const list = await find(loaded, params);
    if (!Array.isArray(list)) return list;
    const next = list.find((i) => !ref || i.id.endsWith(`::${ref}`)) ?? null;
    if (!next)
      return { erro: "Não encontrei um agendamento futuro deste contato." };
    [calendarId, eventId] = [
      next.id.slice(0, next.id.lastIndexOf("::")),
      next.id.slice(next.id.lastIndexOf("::") + 2),
    ];
  }
  const target = all.find((t) => t.calendarId === calendarId);
  if (!target)
    return { erro: "Este agendamento não é de uma agenda da clínica." };

  // Só cancela o agendamento da própria pessoa.
  const event = await calendarApi<GoogleEvent>(
    target.accountId,
    eventPath(calendarId, eventId),
  );
  if (!samePhone(toItem(target, event).telefone, phone)) {
    return { erro: "Este agendamento não é deste contato." };
  }
  await calendarApi(target.accountId, eventPath(calendarId, eventId), {
    method: "DELETE",
  });
  return { ok: true, cancelado: `${calendarId}::${eventId}` };
}

async function listRange(
  loaded: Awaited<ReturnType<typeof loadTargets>>,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const from = brasiliaToUtc(`${text(params.data_inicio).slice(0, 10)}T00:00`);
  const to = brasiliaToUtc(`${text(params.data_fim).slice(0, 10)}T23:59`);
  if (!from || !to) return { erro: "Período inválido." };
  const all = [...loaded.targets, ...(loaded.main ? [loaded.main] : [])];
  const agendamentos: ReturnType<typeof toItem>[] = [];
  for (const target of all) {
    for (const ev of await listEvents(target, from, to)) {
      const item = toItem(target, ev);
      // Compromissos sem telefone (reunião, bloqueio) não são de paciente.
      if (item.telefone) agendamentos.push(item);
    }
  }
  return { agendamentos };
}

/** Executa uma ação da agenda no Google. Nunca lança erro: devolve { erro }. */
export async function callGoogleAgenda(
  integration: Integration,
  services: { name: string; duration_minutes: number }[],
  action: string,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  try {
    const loaded = await loadTargets(integration);
    switch (action) {
      case "consultar_disponibilidade":
        return await availability(loaded, services, params);
      case "criar_agendamento":
        return await create(loaded, services, params);
      case "consultar_agendamentos": {
        const list = await find(loaded, params);
        return Array.isArray(list) ? { agendamentos: list } : list;
      }
      case "cancelar_agendamento":
        return await cancel(loaded, params);
      case "listar_agendamentos":
        return await listRange(loaded, params);
      default:
        return { erro: `Ação de agenda desconhecida: ${action}` };
    }
  } catch (e) {
    console.error(`[google agenda] ${action}:`, (e as Error).message);
    if (e instanceof GoogleError && e.status === 401) {
      return {
        erro: "A conta do Google da clínica precisa ser conectada de novo. Diga que a equipe vai confirmar o horário.",
      };
    }
    return {
      erro: "Não foi possível falar com o Google Agenda agora. Tente novamente em instantes.",
    };
  }
}
