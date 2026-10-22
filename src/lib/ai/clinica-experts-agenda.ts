import "server-only";

import { patientDataLines, parsePatientData } from "@/lib/booking-fields";
import { ceApi, ClinicaExpertsError } from "@/lib/clinica-experts/client";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  brasiliaToUtc,
  durationFor,
  utcToBrasilia,
  type AgendaResult,
  type Integration,
} from "./agenda";

/**
 * As ações da agenda no modo "clinica_experts": a clínica colou a chave da API no painel e ligou
 * cada profissional da LumenzIA a um profissional do Clínica Experts (e um principal). O id que a
 * IA vê é o uuid do agendamento no Clínica Experts.
 *
 * A documentação deles não mostra exemplos de resposta, então a leitura dos horários e das datas
 * aceita os formatos mais prováveis ("HH:mm", "AAAA-MM-DD HH:mm:ss" ou ISO).
 */

type Target = { uuid: string; professional: string | null };

type Patient = {
  uuid?: string;
  name?: string;
  phone?: string | null;
  contacts?: { type?: string; value?: string }[];
};

type Booking = {
  uuid?: string;
  starts_at?: string;
  ends_at?: string;
  status?: string;
  patient?: Patient | null;
  professional?: { uuid?: string | null; name?: string | null } | null;
  procedures?: { id?: number; name?: string }[];
};

type Procedure = { id?: number; name?: string; duration?: number };

const MAX_DAYS = 14;
const MAX_DAY_CALLS = 14; // consultas de horários por pedido (o limite deles é ~100 por minuto)
const SLOTS_PER_DAY = 4;
const MAX_SLOTS = 12;
const MIN_NOTICE_MS = 60 * 60_000;
const LOOKAHEAD_DAYS = 180;
const SLOT_INTERVAL = 30;
const CLOSED = new Set(["canceled", "cancelled", "noshow", "done"]);

const text = (v: unknown) => (v == null ? "" : String(v).trim());
const digits = (v: unknown) => text(v).replace(/\D/g, "");
const fold = (v: unknown) =>
  text(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** O mesmo DDD e número, com ou sem o 55 e o nono dígito. */
function samePhone(a: string, b: string) {
  const key = (s: string) => {
    const local = s.length >= 12 && s.startsWith("55") ? s.slice(2) : s;
    return local.length >= 10 ? local.slice(0, 2) + local.slice(-8) : local;
  };
  if (!a || !b) return false;
  return key(a) === key(b);
}

const localPhone = (phone: string) =>
  phone.length >= 12 && phone.startsWith("55") ? phone.slice(2) : phone;

/** Data e hora do Clínica Experts para um Date: com fuso é exata; sem fuso é Brasília. */
function parseCeDate(value: unknown) {
  const v = text(value);
  if (!v) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return brasiliaToUtc(v.replace(" ", "T"));
}

/** Um Date para "AAAA-MM-DD HH:mm:ss" no horário de Brasília (como o sistema deles mostra). */
const toCeDate = (date: Date) => `${utcToBrasilia(date).replace("T", " ")}:00`;

async function loadTargets(integration: Integration) {
  const { data: professionals } = await createAdminClient()
    .from("professionals")
    .select("name, ce_professional_uuid")
    .eq("clinic_id", integration.clinic_id)
    .order("sort_order")
    .throwOnError();
  const targets: Target[] = professionals
    .filter((p) => p.ce_professional_uuid)
    .map((p) => ({ uuid: p.ce_professional_uuid!, professional: p.name }));
  const main = integration.ce_professional_uuid
    ? { uuid: integration.ce_professional_uuid, professional: null }
    : null;
  return { targets, main };
}

type Loaded = Awaited<ReturnType<typeof loadTargets>>;

/** Os profissionais onde procurar: o pedido, ou todos. */
function pick({ targets, main }: Loaded, professional: unknown) {
  const wanted = fold(professional);
  if (wanted) {
    const found = targets.find((t) => fold(t.professional) === wanted);
    if (found) return [found];
    if (main) return [main];
    return {
      erro: `Não há profissional do Clínica Experts ligado a "${text(professional)}". Use o nome exato de um dos profissionais cadastrados.`,
    };
  }
  const all = main
    ? [...targets, ...(targets.some((t) => t.uuid === main.uuid) ? [] : [main])]
    : targets;
  if (!all.length) {
    return {
      erro: "A clínica ainda não escolheu os profissionais do Clínica Experts para a assistente usar.",
    };
  }
  return all;
}

/** O nome que a IA conhece para um profissional do Clínica Experts. */
function professionalName(loaded: Loaded, booking: Booking) {
  const uuid = text(booking.professional?.uuid);
  return (
    loaded.targets.find((t) => t.uuid === uuid)?.professional ??
    text(booking.professional?.name)
  );
}

/** O procedimento do Clínica Experts com o mesmo nome (sem diferença de acento e maiúscula). */
async function findProcedure(clinicId: string, name: unknown) {
  const wanted = fold(name);
  if (!wanted) return null;
  const res = await ceApi<{ data?: Procedure[] }>(clinicId, "procedures", {
    query: { per_page: 1000 },
  });
  return (res.data ?? []).find((p) => p.id && fold(p.name) === wanted) ?? null;
}

/** Os horários livres de um dia, lidos de { data: [...] } em qualquer dos formatos prováveis. */
function readHours(day: string, data: unknown): Date[] {
  const list = Array.isArray(data) ? data : [];
  const out: Date[] = [];
  for (const item of list) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (obj.available === false || obj.disponivel === false) continue;
    }
    const values =
      item && typeof item === "object"
        ? Object.values(item as Record<string, unknown>)
        : [item];
    for (const raw of values) {
      const v = text(raw);
      let date: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) date = parseCeDate(v);
      else if (/^\d{1,2}:\d{2}/.test(v))
        date = brasiliaToUtc(`${day}T${v.padStart(5, "0").slice(0, 5)}`);
      if (date) {
        out.push(date);
        break;
      }
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

async function hoursOn(
  clinicId: string,
  target: Target,
  day: string,
  procedureId: number | undefined,
) {
  const res = await ceApi<{ data?: unknown }>(clinicId, "available-hours", {
    query: {
      professional_uuid: target.uuid,
      date: day,
      procedure_id: procedureId,
      interval: SLOT_INTERVAL,
    },
  });
  return readHours(day, res.data);
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

async function availability(
  integration: Integration,
  loaded: Loaded,
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
  const list = days(from, to);
  if (!list.length) return { erro: "Período inválido." };

  const procedure = await findProcedure(
    integration.clinic_id,
    params.procedimento,
  );
  const earliest = Date.now() + MIN_NOTICE_MS;
  const free: { profissional: string; data_hora: string }[] = [];
  const perTarget = new Map<string, number>();
  let calls = 0;
  for (const day of list) {
    // O dia inteiro já passou (em Brasília): nem consulta.
    if (brasiliaToUtc(`${day}T23:59`)!.getTime() < earliest) continue;
    const open = chosen.filter((t) => (perTarget.get(t.uuid) ?? 0) < MAX_SLOTS);
    if (!open.length || calls + open.length > MAX_DAY_CALLS) break;
    calls += open.length;
    const hours = await Promise.all(
      open.map((t) => hoursOn(integration.clinic_id, t, day, procedure?.id)),
    );
    open.forEach((target, i) => {
      let perDay = 0;
      for (const slot of hours[i]) {
        if (slot.getTime() < earliest) continue;
        free.push({
          profissional: target.professional ?? "",
          data_hora: utcToBrasilia(slot),
        });
        perTarget.set(target.uuid, (perTarget.get(target.uuid) ?? 0) + 1);
        if (
          ++perDay >= SLOTS_PER_DAY ||
          (perTarget.get(target.uuid) ?? 0) >= MAX_SLOTS
        )
          break;
      }
    });
  }
  return {
    duracao_minutos: minutesFor(services, params.procedimento, procedure),
    horarios_livres: free,
    ...(free.length
      ? {}
      : { aviso: "Nenhum horário livre neste período. Ofereça outras datas." }),
  };
}

/** A duração cadastrada na LumenzIA; se o procedimento não está lá, a do Clínica Experts. */
function minutesFor(
  services: { name: string; duration_minutes: number }[],
  name: unknown,
  procedure: Procedure | null,
) {
  const known = services.some((s) => fold(s.name) === fold(name));
  if (!known && procedure?.duration && procedure.duration > 0)
    return procedure.duration;
  return durationFor(services, name);
}

const patientPhones = (p: Patient) =>
  [
    digits(p.phone),
    ...(p.contacts ?? [])
      .filter((c) => /phone|cel|tel|whats/i.test(text(c.type)))
      .map((c) => digits(c.value)),
  ].filter(Boolean);

/** As pacientes do Clínica Experts com este telefone. */
async function patientsByPhone(clinicId: string, phone: string) {
  const found = new Map<string, Patient>();
  for (const query of new Set([phone, localPhone(phone)])) {
    const res = await ceApi<{ data?: Patient[] }>(clinicId, "patients", {
      query: { phone: query, per_page: 50 },
    });
    for (const p of res.data ?? []) {
      if (p.uuid && patientPhones(p).some((x) => samePhone(x, phone))) {
        found.set(p.uuid, p);
      }
    }
    if (found.size) break;
  }
  return [...found.values()];
}

async function ensurePatient(
  clinicId: string,
  phone: string,
  params: Record<string, unknown>,
) {
  if (phone) {
    const [existing] = await patientsByPhone(clinicId, phone);
    if (existing?.uuid) return existing.uuid;
  }
  const data = parsePatientData(params);
  const res = await ceApi<{ data?: Patient }>(clinicId, "patients", {
    method: "POST",
    body: {
      name: text(params.nome_paciente),
      ...(phone ? { phone: localPhone(phone) } : {}),
      ...(data.email ? { email: data.email } : {}),
      origin: "LumenzIA",
    },
  });
  if (!res.data?.uuid) throw new ClinicaExpertsError("paciente sem uuid", 502);
  return res.data.uuid;
}

async function create(
  integration: Integration,
  loaded: Loaded,
  services: { name: string; duration_minutes: number }[],
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const chosen = pick(loaded, params.profissional);
  if ("erro" in chosen) return chosen;
  const target = chosen[0];
  const start = brasiliaToUtc(params.data_hora);
  if (!start) return { erro: "Informe data_hora no formato AAAA-MM-DDTHH:mm." };
  if (start.getTime() < Date.now()) return { erro: "Este horário já passou." };

  const clinicId = integration.clinic_id;
  const procedure = await findProcedure(clinicId, params.procedimento);
  const minutes = minutesFor(services, params.procedimento, procedure);
  const end = new Date(start.getTime() + minutes * 60_000);

  // Confere que o horário ainda está livre. Se a resposta vier num formato que não sabemos ler
  // (nenhum horário), segue: o próprio Clínica Experts recusa conflitos que não aceita.
  const day = utcToBrasilia(start).slice(0, 10);
  const hours = await hoursOn(clinicId, target, day, procedure?.id);
  if (hours.length && !hours.some((h) => h.getTime() === start.getTime())) {
    return {
      erro: "Este horário não está livre. Consulte a disponibilidade de novo e ofereça outro.",
    };
  }

  const phone = digits(params.telefone);
  const patient = await ensurePatient(clinicId, phone, params);
  const notes = [
    ...patientDataLines(parsePatientData(params)).map(
      ([label, value]) => `${label}: ${value}`,
    ),
    text(params.observacoes) ? `Observações: ${text(params.observacoes)}` : "",
    "Agendado pela assistente LumenzIA.",
  ]
    .filter(Boolean)
    .join("\n");
  const res = await ceApi<{ data?: Booking }>(clinicId, "bookings", {
    method: "POST",
    body: {
      starts_at: toCeDate(start),
      ends_at: toCeDate(end),
      status: "scheduled",
      professional: target.uuid,
      patient,
      ...(procedure?.id ? { procedure: String(procedure.id) } : {}),
      annotation: notes,
    },
  });
  return {
    ok: true,
    id: text(res.data?.uuid),
    data_hora: utcToBrasilia(start),
    duracao_minutos: minutes,
    profissional: target.professional ?? "",
  };
}

function toItem(loaded: Loaded, b: Booking) {
  const start = parseCeDate(b.starts_at);
  return {
    id: text(b.uuid),
    nome_paciente: text(b.patient?.name),
    procedimento: (b.procedures ?? [])
      .map((p) => text(p.name))
      .filter(Boolean)
      .join(", "),
    telefone: b.patient ? (patientPhones(b.patient)[0] ?? "") : "",
    profissional: professionalName(loaded, b),
    data_hora: start ? utcToBrasilia(start) : null,
  };
}

const dayStart = (date: Date) => `${utcToBrasilia(date).slice(0, 10)} 00:00:00`;
const dayEnd = (date: Date) => `${utcToBrasilia(date).slice(0, 10)} 23:59:59`;

async function listBookings(
  clinicId: string,
  query: Record<string, string | number | undefined>,
) {
  const all: Booking[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await ceApi<{
      data?: Booking[];
      meta?: { last_page?: string | number };
    }>(clinicId, "bookings", { query: { ...query, per_page: 500, page } });
    all.push(...(res.data ?? []));
    if (page >= Number(res.meta?.last_page ?? 1)) break;
  }
  return all.filter((b) => b.uuid && !CLOSED.has(text(b.status)));
}

async function find(
  integration: Integration,
  loaded: Loaded,
  params: Record<string, unknown>,
) {
  const chosen = pick(loaded, params.profissional);
  if ("erro" in chosen) return chosen;
  const phone = digits(params.telefone);
  if (!phone) return { erro: "Telefone não informado." };
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);
  const patients = await patientsByPhone(integration.clinic_id, phone);
  const wanted = new Set(chosen.map((t) => t.uuid));
  const filterByProfessional = Boolean(text(params.profissional));
  const found: ReturnType<typeof toItem>[] = [];
  for (const patient of patients) {
    const bookings = await listBookings(integration.clinic_id, {
      patient: patient.uuid,
      starts_at: dayStart(now),
      ends_at: dayEnd(until),
    });
    for (const b of bookings) {
      if (filterByProfessional && !wanted.has(text(b.professional?.uuid)))
        continue;
      const start = parseCeDate(b.starts_at);
      if (start && start.getTime() < now.getTime()) continue;
      found.push(toItem(loaded, { ...b, patient: b.patient ?? patient }));
    }
  }
  return found.sort((a, b) =>
    (a.data_hora ?? "").localeCompare(b.data_hora ?? ""),
  );
}

async function cancel(
  integration: Integration,
  loaded: Loaded,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const phone = digits(params.telefone);
  let uuid = text(params.agendamento_id);
  if (!uuid) {
    const list = await find(integration, loaded, params);
    if (!Array.isArray(list)) return list;
    if (!list.length)
      return { erro: "Não encontrei um agendamento futuro deste contato." };
    uuid = list[0].id;
  }

  // Só cancela o agendamento da própria pessoa.
  const res = await ceApi<{ data?: Booking }>(
    integration.clinic_id,
    `bookings/${encodeURIComponent(uuid)}`,
  );
  const owner = res.data?.patient;
  if (!owner || !patientPhones(owner).some((p) => samePhone(p, phone))) {
    return { erro: "Este agendamento não é deste contato." };
  }
  await ceApi(
    integration.clinic_id,
    `bookings/${encodeURIComponent(uuid)}/cancel`,
    {
      method: "PATCH",
    },
  );
  return { ok: true, cancelado: uuid };
}

async function listRange(
  integration: Integration,
  loaded: Loaded,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  const from = text(params.data_inicio).slice(0, 10);
  const to = text(params.data_fim).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { erro: "Período inválido." };
  }
  const bookings = await listBookings(integration.clinic_id, {
    starts_at: `${from} 00:00:00`,
    ends_at: `${to} 23:59:59`,
  });
  // Sem telefone (bloqueio, compromisso interno) não é de paciente.
  return {
    agendamentos: bookings
      .map((b) => toItem(loaded, b))
      .filter((i) => i.telefone && i.data_hora),
  };
}

/** Executa uma ação da agenda no Clínica Experts. Nunca lança erro: devolve { erro }. */
export async function callClinicaExpertsAgenda(
  integration: Integration,
  services: { name: string; duration_minutes: number }[],
  action: string,
  params: Record<string, unknown>,
): Promise<AgendaResult> {
  try {
    const loaded = await loadTargets(integration);
    switch (action) {
      case "consultar_disponibilidade":
        return await availability(integration, loaded, services, params);
      case "criar_agendamento":
        return await create(integration, loaded, services, params);
      case "consultar_agendamentos": {
        const list = await find(integration, loaded, params);
        return Array.isArray(list) ? { agendamentos: list } : list;
      }
      case "cancelar_agendamento":
        return await cancel(integration, loaded, params);
      case "listar_agendamentos":
        return await listRange(integration, loaded, params);
      default:
        return { erro: `Ação de agenda desconhecida: ${action}` };
    }
  } catch (e) {
    console.error(`[clinica experts] ${action}:`, (e as Error).message);
    if (e instanceof ClinicaExpertsError && e.status === 401) {
      await createAdminClient()
        .from("clinica_experts_accounts")
        .update({
          status: "desconectado",
          last_error: "O Clínica Experts recusou a chave. Conecte de novo.",
        })
        .eq("clinic_id", integration.clinic_id);
      return {
        erro: "A conexão com o Clínica Experts precisa ser refeita. Diga que a equipe vai confirmar o horário.",
      };
    }
    if (e instanceof ClinicaExpertsError && e.status === 404) {
      return { erro: "Agendamento não encontrado no Clínica Experts." };
    }
    if (e instanceof ClinicaExpertsError && e.status === 422) {
      return {
        erro: "O Clínica Experts recusou o pedido. Diga que a equipe vai confirmar o horário.",
      };
    }
    return {
      erro: "Não foi possível falar com o Clínica Experts agora. Tente novamente em instantes.",
    };
  }
}
