import { Suspense } from "react";
import type { Metadata } from "next";
import { MessageCircleQuestion } from "lucide-react";

import { ListEditor } from "@/components/painel/list-editor";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { getListItems } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Perguntas frequentes" };

export default function FaqsPage() {
  return (
    <>
      <PageHeader
        icon={MessageCircleQuestion}
        title="Perguntas frequentes"
        description="As dúvidas que mais chegam no WhatsApp e como a clínica responde. A assistente usa estas respostas primeiro."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Items />
      </Suspense>
    </>
  );
}

async function Items() {
  return <ListEditor kind="faqs" initialItems={await getListItems("faqs")} />;
}
