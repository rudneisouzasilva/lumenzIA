import { Suspense } from "react";
import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";

import { ListEditor } from "@/components/painel/list-editor";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
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
  return (
    <ListEditor kind="services" initialItems={await getListItems("services")} />
  );
}
