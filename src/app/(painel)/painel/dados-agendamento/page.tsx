import { Suspense } from "react";
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { BookingFieldsForm } from "@/components/painel/booking-fields-settings";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { PageTabs } from "@/components/painel/page-tabs";
import { parseBookingFields } from "@/lib/booking-fields";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Dados do agendamento" };

export default function BookingFieldsPage() {
  return (
    <>
      <PageTabs group="roteiro" />
      <PageHeader
        icon={ClipboardList}
        title="Dados do agendamento"
        description="O que a assistente pede antes de marcar. Ela pede tudo de uma vez, depois que a pessoa escolhe o horário."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const { supabase, clinic } = await getPanelContext();
  const { data } = await supabase
    .from("clinics")
    .select("booking_fields")
    .eq("id", clinic.id)
    .single()
    .throwOnError();
  return (
    <PanelCard>
      <BookingFieldsForm initial={parseBookingFields(data.booking_fields)} />
    </PanelCard>
  );
}
