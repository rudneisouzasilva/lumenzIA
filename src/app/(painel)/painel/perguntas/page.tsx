import { Suspense } from "react";
import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { ListEditor } from "@/components/painel/list-editor";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { PageTabs } from "@/components/painel/page-tabs";
import { getListItems } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Perguntas ao paciente" };

export default function AiQuestionsPage() {
  return (
    <>
      <PageTabs group="roteiro" />
      <PageHeader
        icon={ListChecks}
        title="Perguntas ao paciente"
        description="O que a assistente pergunta ao paciente, na ordem, para entender o que ele procura antes de agendar."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Items />
      </Suspense>
    </>
  );
}

async function Items() {
  return (
    <ListEditor
      kind="ai_questions"
      initialItems={await getListItems("ai_questions")}
    />
  );
}
