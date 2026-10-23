import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { AccessSync } from "@/components/painel/access-store";
import { ChatLauncher } from "@/components/painel/chat-launcher";
import { PendingWatcher } from "@/components/painel/pending-watcher";
import { PanelShell } from "@/components/painel/shell";
import { canAccess } from "@/lib/painel/areas";
import { getPanelContext } from "@/lib/painel/context";
import { getInboxData } from "@/lib/painel/data";

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
      watcherSlot={
        <Suspense fallback={null}>
          <Watcher />
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
      <AccessSync access={clinic.access} />
      <Building2 className="size-4 shrink-0 text-primary" />
      <span className="truncate">{clinic.name}</span>
    </span>
  );
}

async function Watcher() {
  const { clinic } = await getPanelContext();
  // A conversa flutuante e o aviso de pendências são da tela de Conversas.
  if (!canAccess(clinic.access, "conversas")) return null;
  const data = await getInboxData();
  return (
    <>
      <PendingWatcher clinicId={data.clinicId} />
      <ChatLauncher {...data} />
    </>
  );
}
