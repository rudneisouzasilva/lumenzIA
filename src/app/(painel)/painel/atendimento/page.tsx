import { Suspense } from "react";
import type { Metadata } from "next";
import { Headset } from "lucide-react";

import { Inbox } from "@/components/painel/inbox";
import { PageHeader } from "@/components/painel/page";
import { getPanelContext } from "@/lib/painel/context";
import { getClinicSettings } from "@/lib/painel/data";
import { publicImageUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Conversas" };

// Vale para "Encerrar": a IA classifica a conversa antes de fechar.
export const maxDuration = 60;

export default function AttendancePage({
  searchParams,
}: PageProps<"/painel/atendimento">) {
  return (
    <>
      <PageHeader
        icon={Headset}
        title="Conversas"
        description="Acompanhe ao vivo o que a assistente está respondendo no WhatsApp. Assuma uma conversa quando quiser e devolva para a IA quando terminar."
      />
      <Suspense
        fallback={
          <div className="h-[min(75vh,44rem)] animate-pulse rounded-2xl bg-muted" />
        }
      >
        <InboxLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InboxLoader({
  searchParams,
}: Pick<PageProps<"/painel/atendimento">, "searchParams">) {
  const [{ supabase, clinic }, settings, { c }] = await Promise.all([
    getPanelContext(),
    getClinicSettings(),
    searchParams,
  ]);
  const { data: images } = await supabase
    .from("images")
    .select("id, storage_path, description")
    .eq("clinic_id", clinic.id)
    .order("created_at");
  const initial = Number(typeof c === "string" ? c : NaN);

  return (
    <Inbox
      clinicId={clinic.id}
      whatsappConnected={Boolean(settings.whatsapp_phone_number_id)}
      initialConversationId={Number.isInteger(initial) ? initial : null}
      images={(images ?? []).map((img) => ({
        id: img.id,
        url: publicImageUrl(img.storage_path),
        description: img.description,
      }))}
    />
  );
}
