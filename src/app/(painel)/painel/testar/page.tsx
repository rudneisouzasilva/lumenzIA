import { Suspense } from "react";
import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";

import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { TestChat } from "@/components/painel/test-chat";
import { getPanelContext } from "@/lib/painel/context";
import { getClinicSettings } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Testar assistente" };

// Vale para a Server Action da conversa: com a agenda, a IA pode precisar de algumas rodadas.
export const maxDuration = 60;

export default function TestPage() {
  return (
    <>
      <PageHeader
        icon={FlaskConical}
        title="Testar assistente"
        description="Converse como se fosse um paciente e veja como a assistente responderia no WhatsApp, com tudo o que está salvo no painel."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Chat />
      </Suspense>
    </>
  );
}

async function Chat() {
  const { supabase, clinic } = await getPanelContext();
  const [settings, { data: integration }] = await Promise.all([
    getClinicSettings(),
    supabase
      .from("integrations")
      .select("enabled")
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
  ]);
  return (
    <TestChat
      assistantName={settings.assistant_name}
      clinicName={settings.name}
      agendaConnected={Boolean(integration?.enabled)}
    />
  );
}
