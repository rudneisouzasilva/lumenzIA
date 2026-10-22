import { Suspense } from "react";
import type { Metadata } from "next";
import { Tags } from "lucide-react";

import { ListEditor } from "@/components/painel/list-editor";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { PageTabs } from "@/components/painel/page-tabs";
import { getListItems } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Motivos de contato" };

export default function ContactReasonsPage() {
  return (
    <>
      <PageTabs group="relatorios" />
      <PageHeader
        icon={Tags}
        title="Motivos de contato"
        description="Categorias para classificar cada conversa encerrada. Aparecem nos relatórios do painel."
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
      kind="contact_reasons"
      initialItems={await getListItems("contact_reasons")}
    />
  );
}
