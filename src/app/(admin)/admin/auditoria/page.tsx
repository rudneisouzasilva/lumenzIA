import { Suspense } from "react";
import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { AuditList } from "@/components/admin/audit-list";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";

export const metadata: Metadata = { title: "Auditoria" };

export default function AuditPage() {
  return (
    <>
      <PageHeader
        icon={ScrollText}
        title="Auditoria"
        description="Ações técnicas da equipe e conexões de WhatsApp, guardadas por 12 meses."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Audit />
      </Suspense>
    </>
  );
}

async function Audit() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select(
      "id, action, details, created_at, profiles(full_name), clinics(id, name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);

  return (
    <PanelCard>
      <AuditList
        entries={data.map((e) => ({
          id: e.id,
          action: e.action,
          details: e.details,
          createdAt: e.created_at,
          who: e.profiles?.full_name ?? null,
          clinic: e.clinics,
        }))}
      />
    </PanelCard>
  );
}
