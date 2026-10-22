import { Suspense } from "react";
import type { Metadata } from "next";
import { Lightbulb, MessagesSquare } from "lucide-react";

import { PastConversationsForm } from "@/components/painel/assistant-forms";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { PageTabs } from "@/components/painel/page-tabs";
import { getClinicSettings } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Exemplos de conversa" };

export default function PastConversationsPage() {
  return (
    <>
      <PageTabs group="conhecimento" />
      <PageHeader
        icon={MessagesSquare}
        title="Exemplos de conversa"
        description="Exemplos reais de atendimento para a assistente aprender o jeito da sua clínica."
      />
      <div className="mb-6 flex gap-3 rounded-xl border border-glow/30 bg-glow/10 p-4 text-sm">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-glow" />
        <p>
          A assistente não copia as conversas: ela usa como referência de tom,
          de como apresentar os procedimentos e de como conduzir até o
          agendamento. Três ou quatro bons exemplos já fazem diferença.
        </p>
      </div>
      <Suspense fallback={<PanelSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const clinic = await getClinicSettings();
  return (
    <PanelCard>
      <PastConversationsForm
        initial={{ pastConversations: clinic.past_conversations }}
      />
    </PanelCard>
  );
}
