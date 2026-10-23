import type { SupabaseClient } from "@supabase/supabase-js";

import { isSubscriptionActive } from "@/lib/billing/active";
import {
  areaForPath,
  canAccess,
  OWNER_ONLY_PATHS,
  toAccess,
} from "@/lib/painel/areas";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Para onde vai quem não pode abrir o painel: a equipe LumenzIA (sem clínica) para /admin e a
 * clínica sem assinatura ativa para /assinatura, e a pessoa da equipe fora das telas liberadas
 * para o início. A mesma regra de getPanelContext, que confere
 * de novo na página; num erro de leitura, deixa passar e a página decide. Usada pelo proxy e
 * pelo login (sem "server-only", por causa do proxy).
 */
export async function panelRedirect(
  supabase: SupabaseClient<Database>,
  userId: string,
  pathname = "/painel",
) {
  const { data, error } = await supabase
    .from("clinic_members")
    .select(
      "role, permissions, clinics(subscriptions(current_period_end, grace_until))",
    )
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return null;
  if (!data?.clinics) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    return isAdmin ? "/admin" : "/assinatura";
  }
  if (!data.clinics.subscriptions.some((s) => isSubscriptionActive(s))) {
    return "/assinatura";
  }
  // Pessoa da equipe numa tela que a dona não liberou: volta ao início com um aviso.
  const access = toAccess(data.role, data.permissions);
  const area = areaForPath(pathname);
  const ownerOnly = OWNER_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if ((area && !canAccess(access, area)) || (ownerOnly && !access.owner)) {
    return "/painel?acesso=negado";
  }
  return null;
}
