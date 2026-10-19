import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { PanelShell } from "@/components/painel/shell";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel LumenzIA" },
  robots: { index: false },
};

export default function PanelLayout({ children }: LayoutProps<"/painel">) {
  return (
    <PanelShell
      clinicSlot={
        <Suspense
          fallback={
            <span className="block h-4 w-32 animate-pulse rounded bg-muted" />
          }
        >
          <ClinicName />
        </Suspense>
      }
    >
      {children}
    </PanelShell>
  );
}

async function ClinicName() {
  const { clinic } = await getPanelContext();
  return (
    <span className="flex items-center gap-2">
      <Building2 className="size-4 shrink-0 text-primary" />
      <span className="truncate">{clinic.name}</span>
    </span>
  );
}
