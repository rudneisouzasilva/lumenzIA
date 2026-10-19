import { Suspense } from "react";
import type { Metadata } from "next";
import { Rocket } from "lucide-react";

import { Onboarding } from "@/components/painel/onboarding";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { getClinicSettings, getHours } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Passo a passo" };

export default function OnboardingPage() {
  return (
    <>
      <PageHeader
        icon={Rocket}
        title="Vamos configurar sua assistente"
        description="Quatro passos rápidos. Tudo pode ser ajustado depois no menu ao lado."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Steps />
      </Suspense>
    </>
  );
}

async function Steps() {
  const [clinic, hours] = await Promise.all([getClinicSettings(), getHours()]);
  return (
    <Onboarding
      identity={{ assistantName: clinic.assistant_name, tone: clinic.tone }}
      businessInfo={clinic.business_info}
      hours={hours}
    />
  );
}
