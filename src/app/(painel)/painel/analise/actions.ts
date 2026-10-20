"use server";

import { refresh } from "next/cache";

import { AiError } from "@/lib/ai/engine";
import { generateInsights, insightsModel } from "@/lib/ai/insights";
import type { FormResult } from "@/lib/auth/validation";
import { isoDateInBrasilia } from "@/lib/format";
import { getActionContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const fail = (error: string): FormResult => ({ ok: false, error });

// Com menos que isso, não há o que analisar com segurança.
const MIN_CLOSED_CONVERSATIONS = 20;
// Uma geração que travou (servidor caiu no meio) libera o mês depois deste tempo.
const STUCK_AFTER_MS = 10 * 60_000;

/** Primeiro dia do mês atual e o período analisado (12 meses até ontem), em Brasília. */
function analysisPeriod(now = new Date()) {
  const today = isoDateInBrasilia(now);
  const [y, m, d] = today.split("-").map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    month: `${today.slice(0, 7)}-01`,
    from: iso(new Date(Date.UTC(y - 1, m - 1, d))),
    to: iso(new Date(Date.UTC(y, m - 1, d - 1))),
  };
}

/**
 * Gera a análise da IA do mês (uma por clínica por mês, em qualquer plano). O mês fica reservado
 * enquanto a IA trabalha; se ela falhar, a reserva é desfeita para tentar de novo.
 */
export async function generateInsightsAction(): Promise<FormResult> {
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const admin = createAdminClient();
  const period = analysisPeriod();

  const { count } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", ctx.clinic.id)
    .neq("status", "aberta")
    .gte("started_at", `${period.from}T03:00:00Z`)
    .throwOnError();
  if ((count ?? 0) < MIN_CLOSED_CONVERSATIONS) {
    return fail(
      `Ainda há poucas conversas para uma boa análise (${count ?? 0} de ${MIN_CLOSED_CONVERSATIONS}). Volte quando a assistente tiver atendido mais pessoas.`,
    );
  }

  // Reserva o mês.
  const values = {
    clinic_id: ctx.clinic.id,
    month: period.month,
    status: "gerando" as const,
    period_from: period.from,
    period_to: period.to,
    content: null,
    model: insightsModel(),
    created_by: ctx.user.id,
  };
  const { data: claimed, error: claimError } = await admin
    .from("ai_insights")
    .insert(values)
    .select("id")
    .maybeSingle();
  let id = claimed?.id;
  if (claimError?.code === "23505") {
    const { data: taken } = await admin
      .from("ai_insights")
      .update(values)
      .eq("clinic_id", ctx.clinic.id)
      .eq("month", period.month)
      .eq("status", "gerando")
      .lt("updated_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString())
      .select("id")
      .throwOnError();
    if (!taken.length) {
      return fail(
        "A análise deste mês já foi feita (ou está sendo feita agora). A próxima pode ser gerada no mês que vem.",
      );
    }
    id = taken[0].id;
  } else if (claimError) {
    console.error("[análise] reservar:", claimError.message);
    return fail("Não foi possível gerar a análise agora. Tente de novo.");
  }

  try {
    const { data: dataset } = await admin
      .rpc("insights_dataset", {
        p_clinic_id: ctx.clinic.id,
        p_from: period.from,
        p_to: period.to,
      })
      .throwOnError();
    const insights = await generateInsights({
      clinicName: ctx.clinic.name,
      dataset,
    });
    await admin
      .from("ai_insights")
      .update({ status: "pronto", content: insights as unknown as Json })
      .eq("id", id!)
      .throwOnError();
  } catch (e) {
    await admin.from("ai_insights").delete().eq("id", id!);
    if (e instanceof AiError) return fail(e.message);
    console.error("[análise] gerar:", (e as Error).message);
    return fail("Não foi possível gerar a análise agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}
