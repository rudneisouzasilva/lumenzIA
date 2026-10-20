import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarSync } from "lucide-react";

import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import {
  FollowUpsManager,
  type FollowUpItem,
} from "@/components/painel/follow-ups-manager";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Retomadas" };

const HISTORY_DAYS = 60;

/** Desde quando mostrar as retomadas que já saíram ou foram canceladas. */
function historySince() {
  return new Date(Date.now() - HISTORY_DAYS * 24 * 3600_000).toISOString();
}

export default function FollowUpsPage() {
  return (
    <>
      <PageHeader
        icon={CalendarSync}
        title="Retomadas"
        description="A LumenzIA volta a chamar quem não agendou: na data que a própria pessoa pediu ou no prazo que a clínica escolher."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <FollowUps />
      </Suspense>
    </>
  );
}

async function FollowUps() {
  const { supabase, clinic } = await getPanelContext();
  const since = historySince();
  const [settings, pending, recent, templates] = await Promise.all([
    supabase
      .from("clinics")
      .select(
        "followup_abandoned_days, followup_concluded_days, followup_max_attempts",
      )
      .eq("id", clinic.id)
      .single()
      .throwOnError(),
    supabase
      .from("follow_ups")
      .select(
        "id, due_at, source, reason, note, attempt, status, sent_at, cancel_reason, last_error, contacts(phone, name, whatsapp_name)",
      )
      .eq("clinic_id", clinic.id)
      .eq("status", "pendente")
      .order("due_at")
      .limit(200)
      .throwOnError(),
    supabase
      .from("follow_ups")
      .select(
        "id, due_at, source, reason, note, attempt, status, sent_at, cancel_reason, last_error, contacts(phone, name, whatsapp_name)",
      )
      .eq("clinic_id", clinic.id)
      .neq("status", "pendente")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(100)
      .throwOnError(),
    supabase
      .from("message_templates")
      .select("purpose, status")
      .eq("clinic_id", clinic.id)
      .in("purpose", ["retomada_pedido", "retomada_sem_resposta"])
      .throwOnError(),
  ]);

  const toItem = (
    f: NonNullable<typeof pending.data>[number],
  ): FollowUpItem => ({
    id: f.id,
    dueAt: f.due_at,
    source: f.source as FollowUpItem["source"],
    reason: f.reason,
    note: f.note,
    attempt: f.attempt,
    status: f.status as FollowUpItem["status"],
    sentAt: f.sent_at,
    cancelReason: f.cancel_reason,
    lastError: f.last_error,
    phone: f.contacts?.phone ?? "",
    name: f.contacts?.name || f.contacts?.whatsapp_name || null,
  });

  return (
    <FollowUpsManager
      settings={{
        abandonedDays: settings.data.followup_abandoned_days,
        concludedDays: settings.data.followup_concluded_days,
        maxAttempts: settings.data.followup_max_attempts,
      }}
      templatesApproved={templates.data.some((t) => t.status === "APPROVED")}
      pending={pending.data.map(toItem)}
      recent={recent.data.map(toItem)}
    />
  );
}
