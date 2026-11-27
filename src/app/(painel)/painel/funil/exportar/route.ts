import { connection } from "next/server";

import { getMyClinic } from "@/lib/billing/subscription";
import { parsePatientData, patientDataLines } from "@/lib/booking-fields";
import { toCsv } from "@/lib/csv";
import { formatPhone, isoDateInBrasilia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 20_000;
const PAGE = 1_000;

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso))
    : "";

const reais = (cents: number | null) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

/** Todos os pacientes do funil em CSV, lidos como a dona logada (o RLS limita à clínica). */
export async function GET() {
  await connection(); // sempre na hora do pedido, nunca gerado no build
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return new Response("Entre de novo para exportar.", { status: 401 });
  const clinic = await getMyClinic(supabase, user.id);
  if (!clinic) return new Response("Conta sem clínica.", { status: 403 });
  // A base inteira de pacientes (com CPF e nascimento, quando houver) sai só pela dona da conta.
  if (!clinic.access.owner)
    return new Response("Só a dona da conta exporta os pacientes.", {
      status: 403,
    });

  const [{ data: stages, error: stagesError }, { data: reasons }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name")
        .eq("clinic_id", clinic.id),
      supabase
        .from("lost_reasons")
        .select("id, name")
        .eq("clinic_id", clinic.id),
    ]);
  if (stagesError) {
    console.error("[funil] exportar etapas:", stagesError.message);
    return new Response("Não foi possível exportar agora.", { status: 500 });
  }
  const stageName = new Map((stages ?? []).map((s) => [s.id, s.name]));
  const reasonName = new Map((reasons ?? []).map((r) => [r.id, r.name]));

  // Em páginas: o Supabase devolve no máximo 1.000 linhas por consulta.
  const contacts = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "name, whatsapp_name, phone, instagram_username, stage_id, estimated_value_cents, notes, lost_reason_id, first_contact_at, last_contact_at, opted_out_at, patient_data",
      )
      .eq("clinic_id", clinic.id)
      .order("last_contact_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[funil] exportar:", error.message);
      return new Response("Não foi possível exportar agora.", { status: 500 });
    }
    contacts.push(...data);
    if (data.length < PAGE) break;
  }

  const header = [
    "Nome",
    "Nome no WhatsApp",
    "Telefone",
    "Instagram",
    "Etapa",
    "Valor estimado (R$)",
    "Anotações",
    "Motivo da perda",
    "Dados do agendamento",
    "Primeiro contato",
    "Último contato",
    "Não quer receber mensagens",
  ];
  const rows = contacts.map((c) => [
    c.name,
    c.whatsapp_name,
    c.phone ? formatPhone(c.phone) : "",
    c.instagram_username ? `@${c.instagram_username}` : "",
    c.stage_id ? (stageName.get(c.stage_id) ?? "") : "Sem etapa",
    reais(c.estimated_value_cents),
    c.notes,
    c.lost_reason_id ? (reasonName.get(c.lost_reason_id) ?? "") : "",
    patientDataLines(parsePatientData(c.patient_data))
      .map(([label, value]) => `${label}: ${value}`)
      .join(" | "),
    when(c.first_contact_at),
    when(c.last_contact_at),
    c.opted_out_at ? "Sim" : "Não",
  ]);

  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pacientes-${isoDateInBrasilia()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
