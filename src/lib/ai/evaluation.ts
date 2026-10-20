import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDate, formatDateTime, normalizePhone } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

import { brasiliaToUtc, type AgendaResult } from "./agenda";

/**
 * Avaliação obrigatória
 * ---------------------
 * Quando a clínica liga a exigência, um item do tipo "procedimento" só é agendado para quem já
 * fez uma avaliação: um agendamento de avaliação com data passada e não cancelado. Com prazo, o
 * procedimento precisa cair até N dias depois dela. A busca usa o registro de agendamentos
 * (appointment_log, 13 meses), que inclui o que foi marcado direto na agenda da clínica.
 */

export type EvaluationRule = {
  require_evaluation: boolean;
  evaluation_validity_days: number | null;
};

type Service = { name: string; kind: string };

const DAY_MS = 24 * 3600_000;

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Se a agenda trouxer um item que não está cadastrado (ex.: um evento criado à mão no Google
 * Agenda), conta como avaliação quando o nome começa com "Avaliação".
 */
function isEvaluation(procedure: string, services: Service[]) {
  const service = services.find((s) => sameName(s.name, procedure));
  if (service) return service.kind === "avaliacao";
  return /^\s*avalia[cç][aã]o/i.test(procedure);
}

/** O item cadastrado só exige avaliação se for do tipo "procedimento"; nome desconhecido não. */
export function requiresEvaluation(
  rule: EvaluationRule,
  services: Service[],
  procedure: unknown,
) {
  if (!rule.require_evaluation) return false;
  const service = services.find((s) =>
    sameName(s.name, String(procedure ?? "")),
  );
  return service?.kind === "procedimento";
}

/**
 * Confere se o contato pode agendar o procedimento pedido. Devolve null quando pode, ou um
 * { erro } para a IA explicar o motivo à pessoa.
 */
export async function checkEvaluation(
  admin: SupabaseClient<Database>,
  clinicId: string,
  rule: EvaluationRule,
  services: Service[],
  params: Record<string, unknown>,
  now = new Date(),
): Promise<AgendaResult | null> {
  if (!requiresEvaluation(rule, services, params.procedimento)) return null;

  const raw = String(params.telefone ?? "");
  const phones = [
    ...new Set(
      [raw.replace(/\D/g, ""), normalizePhone(raw)].filter(
        (p): p is string => !!p,
      ),
    ),
  ];
  const { data: contacts } = phones.length
    ? await admin
        .from("contacts")
        .select("id")
        .eq("clinic_id", clinicId)
        .in("phone", phones)
        .throwOnError()
    : { data: [] };

  const { data: rows } = contacts.length
    ? await admin
        .from("appointment_log")
        .select("procedure_name, starts_at")
        .eq("clinic_id", clinicId)
        .in(
          "contact_id",
          contacts.map((c) => c.id),
        )
        .neq("status", "cancelado")
        .order("starts_at", { ascending: false })
        .limit(100)
        .throwOnError()
    : { data: [] };

  const evaluations = rows.filter((r) =>
    isEvaluation(r.procedure_name, services),
  );
  const done = evaluations.find((r) => new Date(r.starts_at) <= now);
  const upcoming = evaluations
    .filter((r) => new Date(r.starts_at) > now)
    .at(-1); // a mais próxima (a lista vem da mais recente para a mais antiga)
  const evaluationNames = services
    .filter((s) => s.kind === "avaliacao")
    .map((s) => `"${s.name}"`)
    .join(" ou ");
  const offer = evaluationNames
    ? ` Ofereça agendar a avaliação (${evaluationNames}) primeiro.`
    : " Ofereça agendar uma avaliação primeiro.";
  const base = {
    motivo: "avaliacao_necessaria",
    procedimento: String(params.procedimento),
  };

  if (upcoming && !done) {
    return {
      ...base,
      erro: `Este procedimento só pode ser agendado depois da avaliação. A avaliação desta pessoa está marcada para ${formatDateTime(upcoming.starts_at)}; explique que o procedimento pode ser marcado depois dela.`,
    };
  }
  if (!done) {
    return {
      ...base,
      erro: `A clínica faz uma avaliação antes deste procedimento, e esta pessoa ainda não passou por uma.${offer}`,
    };
  }

  const days = rule.evaluation_validity_days;
  if (days === null) return null;
  const startsAt = brasiliaToUtc(params.data_hora) ?? now;
  const validUntil = new Date(
    new Date(done.starts_at).getTime() + days * DAY_MS,
  );
  if (startsAt <= validUntil) return null;

  if (upcoming) {
    return {
      ...base,
      erro: `A última avaliação desta pessoa (${formatDate(done.starts_at)}) vale por ${days} dias, e a próxima avaliação está marcada para ${formatDateTime(upcoming.starts_at)}. Explique que o procedimento pode ser marcado depois dela.`,
    };
  }
  return {
    ...base,
    erro:
      validUntil > now
        ? `A avaliação desta pessoa foi em ${formatDate(done.starts_at)} e vale por ${days} dias, até ${formatDate(validUntil)}. Ofereça uma data até ${formatDate(validUntil)}, ou uma nova avaliação.`
        : `A última avaliação desta pessoa foi em ${formatDate(done.starts_at)} e valia por ${days} dias, até ${formatDate(validUntil)}. Para este procedimento é preciso uma nova avaliação.${offer}`,
  };
}
