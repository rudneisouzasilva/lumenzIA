import { Suspense } from "react";
import type { Metadata } from "next";
import {
  Building2,
  CreditCard,
  MessageSquareText,
  Power,
  Smartphone,
} from "lucide-react";

import { ClinicsTable } from "@/components/admin/clinics-table";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";
import { accessStatus } from "@/lib/admin/clinics";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        icon={Building2}
        title="Clientes"
        description="Todas as clínicas, com assinatura, uso do plano, WhatsApp e assistente."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Clients />
      </Suspense>
    </>
  );
}

const num = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

async function Clients() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.rpc("admin_clinics");
  if (error) throw new Error(error.message);

  const rows = data.map((row) => ({ ...row, access: accessStatus(row) }));
  const active = rows.filter(
    (r) => r.access !== "vencida" && r.access !== "sem",
  );

  const stats = [
    { icon: Building2, label: "Clínicas", value: rows.length },
    { icon: CreditCard, label: "Assinaturas em dia", value: active.length },
    {
      icon: Smartphone,
      label: "WhatsApp conectado",
      value: rows.filter((r) => r.whatsapp_phone_number_id).length,
    },
    {
      icon: Power,
      label: "Assistentes ligadas",
      value: rows.filter((r) => r.is_active).length,
    },
    {
      icon: MessageSquareText,
      label: "Respostas da IA no ciclo",
      value: active.reduce((sum, r) => sum + (r.messages_used ?? 0), 0),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border bg-card p-4 shadow-xs"
          >
            <s.icon className="size-5 text-primary" />
            <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
              {num(s.value)}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <ClinicsTable rows={rows} />
    </div>
  );
}
