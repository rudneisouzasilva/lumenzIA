import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";

import { HoursForm } from "@/components/painel/hours-form";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { getHours } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Horários" };

export default function HoursPage() {
  return (
    <>
      <PageHeader
        icon={CalendarClock}
        title="Horários"
        description="Quando a clínica atende. A assistente usa isso para orientar o paciente e sugerir horários."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  return (
    <PanelCard>
      <HoursForm initial={await getHours()} />
    </PanelCard>
  );
}
