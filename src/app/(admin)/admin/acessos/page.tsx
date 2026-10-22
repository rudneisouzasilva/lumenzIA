import { Suspense } from "react";
import type { Metadata } from "next";
import { Gift } from "lucide-react";

import {
  GrantForm,
  GrantsTable,
  type GrantRow,
} from "@/components/admin/access-grants";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";
import { ACCESS_LABELS, accessStatus } from "@/lib/admin/clinics";

export const metadata: Metadata = { title: "Acessos" };

export default function AccessPage() {
  return (
    <>
      <PageHeader
        icon={Gift}
        title="Acessos"
        description="Libere um plano por alguns dias, sem cobrança, para demonstrações e cortesias. O acesso termina sozinho no fim do período; se a clínica assinar antes, os dias que faltavam passam para o plano pago."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Grants />
      </Suspense>
    </>
  );
}

async function Grants() {
  const { supabase } = await getAdminContext();
  const [clinicsRes, plansRes, grantsRes] = await Promise.all([
    supabase.rpc("admin_clinics"),
    supabase
      .from("plans")
      .select("id, name, message_quota")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("subscriptions")
      .select(
        "id, clinic_id, current_period_start, current_period_end, messages_used_this_period, grant_note, clinics(name), plans(name, message_quota), profiles(full_name)",
      )
      .eq("is_grant", true)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  for (const r of [clinicsRes, plansRes, grantsRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const clinics = (clinicsRes.data ?? []).map((c) => {
    const access = accessStatus(c);
    const current = access === "ativa" || access === "tolerancia";
    return {
      id: c.id,
      name: c.name,
      ownerEmail: c.owner_email,
      status:
        current && c.is_grant
          ? "acesso liberado"
          : ACCESS_LABELS[access].toLowerCase(),
      paid: current && !c.is_grant,
    };
  });
  const plans = (plansRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    quota: p.message_quota,
  }));
  const rows: GrantRow[] = (grantsRes.data ?? []).map((g) => ({
    id: g.id,
    clinicId: g.clinic_id,
    clinicName: g.clinics?.name ?? "—",
    planName: g.plans?.name ?? "—",
    quota: g.plans?.message_quota ?? 0,
    used: g.messages_used_this_period,
    start: g.current_period_start,
    end: g.current_period_end,
    note: g.grant_note,
    grantedBy: g.profiles?.full_name || null,
  }));

  return (
    <div className="grid gap-6">
      <PanelCard
        title="Liberar acesso"
        description="Se a clínica já tem um acesso liberado em vigor, ele é ajustado: novo plano e novo fim, contado a partir de hoje."
      >
        <GrantForm clinics={clinics} plans={plans} />
      </PanelCard>
      <PanelCard title="Acessos liberados">
        <GrantsTable rows={rows} />
      </PanelCard>
    </div>
  );
}
