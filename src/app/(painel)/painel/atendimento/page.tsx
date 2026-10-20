import { Suspense } from "react";
import type { Metadata } from "next";
import { Headset } from "lucide-react";

import { Inbox } from "@/components/painel/inbox";
import { PageHeader } from "@/components/painel/page";
import { getInboxData } from "@/lib/painel/data";

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
  const [data, { c }] = await Promise.all([getInboxData(), searchParams]);
  const initial = Number(typeof c === "string" ? c : NaN);

  return (
    <Inbox
      {...data}
      initialConversationId={Number.isInteger(initial) ? initial : null}
    />
  );
}
