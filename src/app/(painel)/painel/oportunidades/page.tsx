import { Suspense } from "react";
import type { Metadata } from "next";
import { PhoneOutgoing } from "lucide-react";

import {
  OpportunitiesList,
  type Opportunity,
} from "@/components/painel/opportunities-list";
import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { getPanelContext } from "@/lib/painel/context";
import { getInboxData } from "@/lib/painel/data";

export const metadata: Metadata = { title: "Contatos a fazer" };

const LIMIT = 100;

export default function OpportunitiesPage() {
  return (
    <>
      <PageHeader
        icon={PhoneOutgoing}
        title="Contatos a fazer"
        description="Quem conversou com a clínica, mostrou interesse e ainda não agendou, do mais promissor para o menos. Quem pediu para não receber mensagens ou já tem retomada marcada não aparece."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  const [{ supabase, clinic }, inbox] = await Promise.all([
    getPanelContext(),
    getInboxData(),
  ]);
  const { data } = await supabase
    .rpc("potential_contacts", { p_clinic_id: clinic.id, p_limit: LIMIT })
    .throwOnError();

  const items: Opportunity[] = data.map((c) => ({
    contactId: c.contact_id,
    phone: c.phone,
    name: c.name,
    stage: c.stage_name,
    lastContactAt: c.last_contact_at,
    conversations: c.conversations,
    lastStatus: c.last_status,
    reason: c.last_reason,
    summary: c.last_summary,
    conversationId: c.conversation_id,
    score: c.score,
  }));
  return (
    <OpportunitiesList
      items={items}
      templates={inbox.templates}
      clinic={inbox.clinic}
      whatsappConnected={inbox.whatsappConnected}
    />
  );
}
