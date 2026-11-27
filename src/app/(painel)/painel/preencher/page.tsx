import { Suspense } from "react";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { SetupAutofill } from "@/components/painel/setup-autofill";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Preencher com IA" };
// A leitura do texto pela IA pode levar alguns segundos.
export const maxDuration = 60;

export default function AutofillPage() {
  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Preencher com IA"
        description="Cole o texto do site, da tabela de preços ou de um documento da clínica, ou use o Instagram conectado. A IA sugere informações, procedimentos, perguntas frequentes, profissionais e horários, e você escolhe o que entra."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { supabase, clinic } = await getPanelContext();
  const { data: instagram } = await supabase
    .from("instagram_accounts")
    .select("username, status")
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  return (
    <SetupAutofill
      instagram={instagram?.status === "ativo" ? instagram.username : null}
    />
  );
}
