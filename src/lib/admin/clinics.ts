import type { Database } from "@/lib/supabase/database.types";

export type AdminClinicRow =
  Database["public"]["Functions"]["admin_clinics"]["Returns"][number];

export type AccessStatus = "ativa" | "tolerancia" | "vencida" | "sem";

export const ACCESS_LABELS: Record<AccessStatus, string> = {
  ativa: "Ativa",
  tolerancia: "Tolerância",
  vencida: "Vencida",
  sem: "Sem assinatura",
};

/** Mesmo critério do painel: vale o período pago e, depois dele, a tolerância. */
export function accessStatus(
  row: Pick<AdminClinicRow, "current_period_end" | "grace_until" | "plan_name">,
  now = Date.now(),
): AccessStatus {
  if (!row.plan_name) return "sem";
  const end = row.current_period_end ? Date.parse(row.current_period_end) : 0;
  const grace = row.grace_until ? Date.parse(row.grace_until) : 0;
  if (end > now) return "ativa";
  if (grace > now) return "tolerancia";
  return "vencida";
}
