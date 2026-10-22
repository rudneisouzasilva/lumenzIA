import { Suspense } from "react";
import type { Metadata } from "next";
import { KanbanSquare } from "lucide-react";

import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import {
  PipelineBoard,
  type BoardContact,
  type BoardStage,
} from "@/components/painel/pipeline-board";
import { parsePatientData, patientDataLines } from "@/lib/booking-fields";
import { contactHandle } from "@/lib/format";
import { getPanelContext } from "@/lib/painel/context";
import type { StageColor, StageKind } from "@/lib/painel/pipeline";

export const metadata: Metadata = { title: "Funil" };

// Por etapa, os contatos mais recentes; a busca encontra os outros.
const PER_STAGE = 50;

const CONTACT_COLUMNS =
  "id, phone, instagram_username, name, whatsapp_name, stage_id, stage_changed_at, owner_id, estimated_value_cents, notes, lost_reason_id, last_contact_at, opted_out_at, patient_data, conversations!conversations_contact_id_fkey(id, last_message_at, summary)";

export default function PipelinePage({
  searchParams,
}: PageProps<"/painel/funil">) {
  return (
    <>
      <PageHeader
        icon={KanbanSquare}
        title="Funil"
        description="Cada pessoa que chamou a clínica, da primeira mensagem ao agendamento. A LumenzIA move os contatos sozinha; arraste para ajustar."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Board({
  searchParams,
}: Pick<PageProps<"/painel/funil">, "searchParams">) {
  const [{ supabase, clinic }, params] = await Promise.all([
    getPanelContext(),
    searchParams,
  ]);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";

  const [{ data: stages }, { data: lostReasons }, { data: members }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, color, sort_order, kind, auto_rule")
        .eq("clinic_id", clinic.id)
        .order("sort_order")
        .throwOnError(),
      supabase
        .from("lost_reasons")
        .select("id, name")
        .eq("clinic_id", clinic.id)
        .order("sort_order")
        .throwOnError(),
      supabase
        .from("clinic_members")
        .select("user_id, profiles(full_name)")
        .eq("clinic_id", clinic.id)
        .throwOnError(),
    ]);

  // Uma consulta por etapa (e uma para quem ficou sem etapa), com o total de cada uma.
  const columns = await Promise.all(
    [...stages.map((s) => s.id), null].map(async (stageId) => {
      let query = supabase
        .from("contacts")
        .select(CONTACT_COLUMNS, { count: "exact" })
        .eq("clinic_id", clinic.id);
      query = stageId
        ? query.eq("stage_id", stageId)
        : query.is("stage_id", null);
      if (q) {
        const digits = q.replace(/\D/g, "");
        const safe = q.replace(/[%_,()]/g, " ");
        query = query.or(
          [
            `name.ilike.%${safe}%`,
            `whatsapp_name.ilike.%${safe}%`,
            ...(digits.length >= 3 ? [`phone.like.%${digits}%`] : []),
          ].join(","),
        );
      }
      const { data, count } = await query
        .order("last_contact_at", { ascending: false })
        .order("last_message_at", {
          referencedTable: "conversations",
          ascending: false,
        })
        .limit(1, { referencedTable: "conversations" })
        .limit(PER_STAGE)
        .throwOnError();
      return { stageId, contacts: data, total: count ?? data.length };
    }),
  );

  const boardStages: BoardStage[] = stages.map((s) => {
    const column = columns.find((c) => c.stageId === s.id)!;
    return {
      id: s.id,
      name: s.name,
      color: s.color as StageColor,
      kind: s.kind as StageKind,
      autoRule: s.auto_rule,
      total: column.total,
    };
  });
  const contacts: BoardContact[] = columns.flatMap((c) =>
    c.contacts.map((ct) => ({
      id: ct.id,
      handle: contactHandle(ct),
      name: ct.name || ct.whatsapp_name || null,
      savedName: ct.name,
      stageId: ct.stage_id,
      stageChangedAt: ct.stage_changed_at,
      ownerId: ct.owner_id,
      estimatedValueCents: ct.estimated_value_cents,
      notes: ct.notes,
      lostReasonId: ct.lost_reason_id,
      lastContactAt: ct.last_contact_at,
      optedOut: Boolean(ct.opted_out_at),
      patientData: patientDataLines(parsePatientData(ct.patient_data)),
      lastConversationId: ct.conversations[0]?.id ?? null,
      lastSummary: ct.conversations[0]?.summary ?? null,
    })),
  );
  const unstaged = columns.find((c) => c.stageId === null)!;

  return (
    <PipelineBoard
      key={q}
      query={q}
      stages={boardStages}
      unstagedTotal={unstaged.total}
      contacts={contacts}
      lostReasons={lostReasons}
      members={members.map((m) => ({
        id: m.user_id,
        name: m.profiles?.full_name || "Sem nome",
      }))}
    />
  );
}
