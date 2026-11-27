import { Suspense } from "react";
import type { Metadata } from "next";
import { Tags } from "lucide-react";

import { PlansEditor } from "@/components/admin/plans-editor";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getAdminContext } from "@/lib/admin/context";

export const metadata: Metadata = { title: "Planos" };

export default function PlansPage() {
  return (
    <>
      <PageHeader
        icon={Tags}
        title="Planos"
        description="Preço mensal e cota de mensagens da IA de cada plano. O novo valor aparece na hora no site, no cadastro e na tela de assinatura."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Plans />
      </Suspense>
    </>
  );
}

async function Plans() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_cents, message_quota, active")
    .order("sort_order");
  if (error) throw new Error(error.message);

  return (
    <PanelCard
      title="Preços"
      description="Vale para as próximas assinaturas. Quem já assinou continua pagando o valor que autorizou no Mercado Pago."
    >
      <PlansEditor
        plans={(data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          priceCents: p.price_cents,
          quota: p.message_quota,
          active: p.active,
        }))}
      />
    </PanelCard>
  );
}
