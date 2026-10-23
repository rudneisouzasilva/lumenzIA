import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { toAccess } from "@/lib/painel/areas";
import type { Database } from "@/lib/supabase/database.types";

import { isSubscriptionActive } from "./active";

export { isSubscriptionActive };

type Client = SupabaseClient<Database>;

export type SubscriptionRow =
  Database["public"]["Tables"]["subscriptions"]["Row"] & {
    plans: { code: string; name: string; message_quota: number } | null;
  };

/** A clínica da pessoa logada (a primeira, se for de mais de uma), o papel e as áreas liberadas. */
export async function getMyClinic(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("role, permissions, clinics(id, name)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.clinics) return null;
  return {
    id: data.clinics.id,
    name: data.clinics.name,
    role: data.role,
    access: toAccess(data.role, data.permissions),
  };
}

/** Assinaturas da clínica, da mais nova para a mais antiga (lidas pelo RLS). */
export async function getClinicSubscriptions(
  supabase: Client,
  clinicId: string,
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plans(code, name, message_quota)")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as SubscriptionRow[];
}

/** A assinatura que hoje dá acesso, se houver: a que vale por mais tempo. */
export function pickActiveSubscription(subs: SubscriptionRow[]) {
  const end = (s: SubscriptionRow) =>
    Math.max(
      s.current_period_end ? Date.parse(s.current_period_end) : 0,
      s.grace_until ? Date.parse(s.grace_until) : 0,
    );
  return (
    subs
      .filter((s) => isSubscriptionActive(s))
      .sort((a, b) => end(b) - end(a))[0] ?? null
  );
}

/** Assinatura iniciada nas últimas 24 horas que ainda espera o primeiro pagamento. */
export function findRecentPending(subs: SubscriptionRow[], now = Date.now()) {
  return subs.find(
    (s) =>
      s.status === "pending" &&
      now - Date.parse(s.created_at) < 24 * 3600 * 1000,
  );
}

/** Período pago já acabou, mas a tolerância depois de uma cobrança recusada ainda vale. */
export function isInGracePeriod(
  sub: Pick<SubscriptionRow, "current_period_end" | "grace_until">,
  now = Date.now(),
) {
  return Boolean(
    sub.grace_until &&
    (!sub.current_period_end || Date.parse(sub.current_period_end) < now),
  );
}
