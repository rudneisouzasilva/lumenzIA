import { Suspense } from "react";
import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";

import { EvaluationSettingsForm } from "@/components/painel/evaluation-settings";
import { ListEditor } from "@/components/painel/list-editor";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getPanelContext } from "@/lib/painel/context";
import { getListItems } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Procedimentos" };

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        icon={Stethoscope}
        title="Procedimentos"
        description="O que a clínica oferece e quanto tempo cada atendimento ocupa na agenda."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Items />
      </Suspense>
    </>
  );
}

async function Items() {
  const { supabase, clinic } = await getPanelContext();
  const [items, settings] = await Promise.all([
    getListItems("services"),
    supabase
      .from("clinics")
      .select("require_evaluation, evaluation_validity_days")
      .eq("id", clinic.id)
      .single()
      .throwOnError(),
  ]);

  return (
    <div className="space-y-6">
      <PanelCard
        title="Avaliação antes do procedimento"
        description="Para clínicas que sempre fazem uma avaliação antes de qualquer procedimento."
      >
        <EvaluationSettingsForm
          initial={{
            required: settings.data.require_evaluation,
            validityDays: settings.data.evaluation_validity_days,
          }}
          hasEvaluation={items.some((i) => i.kind === "avaliacao")}
        />
      </PanelCard>
      <ListEditor kind="services" initialItems={items} />
    </div>
  );
}
