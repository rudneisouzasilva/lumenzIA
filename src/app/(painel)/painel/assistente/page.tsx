import { Suspense } from "react";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import {
  IdentityForm,
  KnowledgeForm,
  RulesForm,
} from "@/components/painel/assistant-forms";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getClinicSettings } from "@/lib/painel/data";
import { TIMEOUT_OPTIONS } from "@/lib/painel/validation";

export const metadata: Metadata = { title: "Assistente" };

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Assistente"
        description="Como ela se apresenta, como fala e tudo o que precisa saber sobre a clínica."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Forms />
      </Suspense>
    </>
  );
}

async function Forms() {
  const clinic = await getClinicSettings();
  const timeout = String(clinic.conversation_timeout_hours ?? "");

  return (
    <div className="space-y-6">
      <PanelCard
        title="Identidade"
        description="O nome e o jeito de falar da assistente."
      >
        <IdentityForm
          initial={{ assistantName: clinic.assistant_name, tone: clinic.tone }}
        />
      </PanelCard>
      <PanelCard
        title="Sobre a clínica"
        description="Quanto mais completo, menos a assistente precisa chamar a equipe."
      >
        <KnowledgeForm initial={{ businessInfo: clinic.business_info }} />
      </PanelCard>
      <PanelCard title="Regras e encerramento">
        <RulesForm
          initial={{
            behaviorRules: clinic.behavior_rules,
            timeoutHours: (TIMEOUT_OPTIONS as readonly string[]).includes(
              timeout,
            )
              ? (timeout as (typeof TIMEOUT_OPTIONS)[number])
              : "",
          }}
        />
      </PanelCard>
    </div>
  );
}
