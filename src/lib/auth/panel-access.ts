import type { SupabaseClient } from "@supabase/supabase-js";

import { isSubscriptionActive } from "@/lib/billing/active";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Para onde vai quem não pode abrir o painel: a equipe LumenzIA (sem clínica) para /admin e a
 * clínica sem assinatura ativa para /assinatura. A mesma regra de getPanelContext, que confere
 * de novo na página; num erro de leitura, deixa passar e a página decide. Usada pelo proxy e
 * pelo login (sem "server-only", por causa do proxy).
 */
export async function panelRedirect(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("clinics(subscriptions(current_period_end, grace_until))")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return null;
  if (!data?.clinics) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    return isAdmin ? "/admin" : "/assinatura";
  }
  return data.clinics.subscriptions.some((s) => isSubscriptionActive(s))
    ? null
    : "/assinatura";
}
