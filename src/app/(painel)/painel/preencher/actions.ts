"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  AUTOFILL_MAX_CHARS,
  AUTOFILL_MIN_CHARS,
  suggestClinicSetup,
  type SetupSuggestion,
} from "@/lib/ai/autofill";
import { AiError } from "@/lib/ai/provider";
import { getInstagramSender } from "@/lib/instagram/account";
import { fetchAccountText } from "@/lib/instagram/api";
import { getActionContext } from "@/lib/painel/context";
import { LIST_LIMITS, SERVICE_KINDS } from "@/lib/painel/validation";
import { createAdminClient } from "@/lib/supabase/admin";

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

/** Lê o texto colado e devolve a sugestão (nada é gravado). Só a dona. */
export async function suggestSetup(
  source: unknown,
): Promise<{ ok: true; suggestion: SetupSuggestion } | Failure> {
  const text = typeof source === "string" ? source.trim() : "";
  if (text.length < AUTOFILL_MIN_CHARS)
    return fail("Cole um texto um pouco maior para a IA ter o que ler.");
  if (text.length > AUTOFILL_MAX_CHARS)
    return fail(
      `O texto passou de ${AUTOFILL_MAX_CHARS.toLocaleString("pt-BR")} caracteres. Cole uma parte de cada vez.`,
    );

  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  try {
    const suggestion = await suggestClinicSetup({
      clinicName: ctx.clinic.name,
      source: text,
    });
    return { ok: true, suggestion };
  } catch (e) {
    console.error("[preencher] IA:", (e as Error).message);
    return fail(
      e instanceof AiError
        ? e.message
        : "Não foi possível ler o texto agora. Tente de novo.",
    );
  }
}

/** Bio, site e legendas dos posts do Instagram conectado, para colar no campo. Só a dona. */
export async function readInstagramText(): Promise<
  { ok: true; text: string } | Failure
> {
  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  try {
    const sender = await getInstagramSender(createAdminClient(), ctx.clinic.id);
    if (!sender) return fail("Conecte o Instagram da clínica primeiro.");
    const text = await fetchAccountText(sender);
    if (!text.trim())
      return fail("Não encontramos bio nem legendas nesse Instagram.");
    return { ok: true, text: text.slice(0, AUTOFILL_MAX_CHARS) };
  } catch (e) {
    console.error("[preencher] instagram:", (e as Error).message);
    return fail("Não foi possível ler o Instagram agora. Tente de novo.");
  }
}

const applySchema = z.object({
  businessInfo: z.string().trim().max(8000),
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        durationMinutes: z.number().int().min(5).max(720),
        kind: z.enum(SERVICE_KINDS),
      }),
    )
    .max(60),
  faqs: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(500),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .max(40),
  professionals: z.array(z.string().trim().min(1).max(120)).max(30),
  hours: z
    .object({
      workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .refine((h) => h.end > h.start)
    .nullable(),
});

export type ApplySummary = {
  businessInfo: boolean;
  services: number;
  faqs: number;
  professionals: number;
  hours: boolean;
  skipped: number;
};

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Grava o que a dona marcou. Itens com o mesmo nome (ou a mesma pergunta) de um que já existe
 * ficam de fora; as informações entram no fim do texto que já havia, sem apagar nada.
 */
export async function applySetup(
  input: unknown,
): Promise<{ ok: true; summary: ApplySummary } | Failure> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return fail("Confira os itens marcados.");
  const v = parsed.data;

  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  const { supabase } = ctx;
  const clinicId = ctx.clinic.id;
  const summary: ApplySummary = {
    businessInfo: false,
    services: 0,
    faqs: 0,
    professionals: 0,
    hours: false,
    skipped: 0,
  };

  /** Acrescenta no fim da lista, sem repetir e sem passar do limite. */
  async function addTo<T>(
    table: "services" | "faqs" | "professionals",
    column: "name" | "question",
    items: T[],
    label: (x: T) => string,
    row: (x: T) => Record<string, unknown>,
  ) {
    if (!items.length) return 0;
    const { data: existing, error } = await supabase
      .from(table as "services")
      .select(`${column}, sort_order`)
      .eq("clinic_id", clinicId);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (existing ?? []) as unknown as Record<string, unknown>[];
    const have = new Set(rows.map((r) => key(String(r[column] ?? ""))));
    let order = Math.max(-1, ...rows.map((r) => Number(r.sort_order) || 0));
    const room = LIST_LIMITS[table] - rows.length;
    const fresh = items.filter((x) => {
      const k = key(label(x));
      if (have.has(k)) return false;
      have.add(k);
      return true;
    });
    summary.skipped += items.length - fresh.length;
    const take = fresh.slice(0, Math.max(0, room));
    summary.skipped += fresh.length - take.length;
    if (!take.length) return 0;
    const { error: insertError } = await supabase
      .from(table as "services")
      .insert(
        take.map((x) => ({
          ...row(x),
          clinic_id: clinicId,
          sort_order: ++order,
        })) as never,
      );
    if (insertError) throw new Error(`${table}: ${insertError.message}`);
    return take.length;
  }

  try {
    summary.services = await addTo(
      "services",
      "name",
      v.services,
      (s) => s.name,
      (s) => ({
        name: s.name,
        duration_minutes: s.durationMinutes,
        kind: s.kind,
      }),
    );
    summary.faqs = await addTo(
      "faqs",
      "question",
      v.faqs,
      (f) => f.question,
      (f) => ({ question: f.question, answer: f.answer }),
    );
    summary.professionals = await addTo(
      "professionals",
      "name",
      v.professionals,
      (n) => n,
      (n) => ({ name: n }),
    );

    const update: {
      business_info?: string;
      work_days?: number[];
      work_hours_start?: string;
      work_hours_end?: string;
    } = {};
    if (v.businessInfo) {
      const { data } = await supabase
        .from("clinics")
        .select("business_info")
        .eq("id", clinicId)
        .single()
        .throwOnError();
      const before = data.business_info.trim();
      update.business_info = (
        before ? `${before}\n\n${v.businessInfo}` : v.businessInfo
      ).slice(0, 20000);
      summary.businessInfo = true;
    }
    if (v.hours) {
      update.work_days = [...new Set(v.hours.workDays)].sort();
      update.work_hours_start = v.hours.start;
      update.work_hours_end = v.hours.end;
      summary.hours = true;
    }
    if (Object.keys(update).length) {
      await supabase
        .from("clinics")
        .update(update)
        .eq("id", clinicId)
        .throwOnError();
    }
  } catch (e) {
    console.error("[preencher] gravar:", (e as Error).message);
    refresh();
    return fail(
      "Parte do que foi marcado não pôde ser salva. Confira as telas e tente de novo.",
    );
  }
  refresh();
  return { ok: true, summary };
}
