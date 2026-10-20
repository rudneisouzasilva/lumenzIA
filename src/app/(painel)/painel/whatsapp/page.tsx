import { Suspense } from "react";
import type { Metadata } from "next";
import { Smartphone } from "lucide-react";

import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { WhatsappConnect } from "@/components/painel/whatsapp-connect";
import { getPanelContext } from "@/lib/painel/context";
import {
  embeddedSignupConfig,
  historyRetryAllowed,
} from "@/lib/whatsapp/embedded-signup";

export const metadata: Metadata = { title: "WhatsApp" };

export default function WhatsappPage() {
  return (
    <>
      <PageHeader
        icon={Smartphone}
        title="WhatsApp"
        description="Conecte o número da clínica para a assistente responder os pacientes."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Connection />
      </Suspense>
    </>
  );
}

async function Connection() {
  const { supabase, clinic } = await getPanelContext();
  const { data, error } = await supabase
    .from("clinics")
    .select(
      "whatsapp_phone_number_id, whatsapp_display_phone, whatsapp_verified_name, whatsapp_connected_at, whatsapp_coexistence, whatsapp_history_status, whatsapp_history_progress, whatsapp_history_messages",
    )
    .eq("id", clinic.id)
    .single();
  if (error) throw new Error(error.message);

  return (
    <PanelCard
      title={
        data.whatsapp_phone_number_id ? "Número conectado" : "Conectar número"
      }
      description={
        data.whatsapp_phone_number_id
          ? "As mensagens que chegam neste número são respondidas pela assistente quando ela está ligada."
          : "Leva uns 5 minutos. Tenha em mãos o celular do número para receber o código de confirmação."
      }
    >
      <WhatsappConnect
        config={embeddedSignupConfig()}
        isOwner={clinic.role === "owner"}
        connection={
          data.whatsapp_phone_number_id
            ? {
                displayPhone: data.whatsapp_display_phone,
                verifiedName: data.whatsapp_verified_name,
                connectedAt: data.whatsapp_connected_at,
                coexistence: data.whatsapp_coexistence,
                history: {
                  status: data.whatsapp_history_status,
                  progress: data.whatsapp_history_progress,
                  messages: data.whatsapp_history_messages,
                  canRetry: historyRetryAllowed(
                    data.whatsapp_history_status,
                    data.whatsapp_connected_at,
                  ),
                },
              }
            : null
        }
      />
    </PanelCard>
  );
}
