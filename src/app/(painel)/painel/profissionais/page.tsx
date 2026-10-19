import { Suspense } from "react";
import type { Metadata } from "next";
import { Users } from "lucide-react";

import { ListEditor } from "@/components/painel/list-editor";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { getListItems } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Profissionais" };

export default function ProfessionalsPage() {
  return (
    <>
      <PageHeader
        icon={Users}
        title="Profissionais"
        description="Quem atende na clínica. O paciente pode escolher com quem quer ser atendido."
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
      kind="professionals"
      initialItems={await getListItems("professionals")}
    />
  );
}
