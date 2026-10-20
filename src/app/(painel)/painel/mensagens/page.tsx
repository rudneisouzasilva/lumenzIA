import { Suspense } from "react";
import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";

import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { TemplatesManager } from "@/components/painel/templates-manager";
import { getPanelContext } from "@/lib/painel/context";
import { getClinicSettings } from "@/lib/painel/data";
import type { TemplatePurpose } from "@/lib/whatsapp/template-pack";

export const metadata: Metadata = { title: "Mensagens prontas" };

// Criar o pacote fala com a Meta uma vez por mensagem.
export const maxDuration = 60;

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        icon={MessageSquareText}
        title="Mensagens prontas"
        description="Os textos aprovados pela Meta que a clínica usa para lembretes, retomadas e para escrever depois das 24 horas do WhatsApp."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Templates />
      </Suspense>
    </>
  );
}

async function Templates() {
  const [{ supabase, clinic }, settings] = await Promise.all([
    getPanelContext(),
    getClinicSettings(),
  ]);
  const { data, error } = await supabase
    .from("message_templates")
    .select(
      "id, purpose, name, category, body, footer, example, status, rejected_reason, last_error",
    )
    .eq("clinic_id", clinic.id)
    .order("created_at");
  if (error) throw new Error(error.message);

  return (
    <TemplatesManager
      whatsappConnected={Boolean(settings.whatsapp_phone_number_id)}
      items={data.map((t) => ({
        id: t.id,
        purpose: t.purpose as TemplatePurpose,
        name: t.name,
        category: t.category,
        body: t.body,
        footer: t.footer,
        example: Array.isArray(t.example) ? t.example.map(String) : [],
        status: t.status,
        rejectedReason: t.rejected_reason,
        lastError: t.last_error,
      }))}
    />
  );
}
