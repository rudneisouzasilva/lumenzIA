import { connection, type NextRequest } from "next/server";

import { getMyClinic } from "@/lib/billing/subscription";
import { parsePeriod } from "@/lib/painel/period";
import { createClient } from "@/lib/supabase/server";

const STATUS = {
  aberta: "Em andamento",
  concluida: "Concluída",
  abandonada: "Não finalizada",
};
const ATTENDANCE = {
  ia: "IA",
  pendente: "Aguardando a equipe",
  equipe: "Equipe",
};
const MAX_ROWS = 10_000;

/** Célula de CSV com ponto e vírgula (o padrão do Excel em português). */
function cell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso))
    : "";

/** Conversas do período em CSV, lidas como a pessoa logada (o RLS limita à clínica dela). */
export async function GET(request: NextRequest) {
  await connection(); // sempre na hora do pedido, nunca gerado no build
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return new Response("Entre de novo para exportar.", { status: 401 });
  const clinic = await getMyClinic(supabase, user.id);
  if (!clinic) return new Response("Conta sem clínica.", { status: 403 });

  const { from, to } = parsePeriod(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  // Limites do período em Brasília (UTC-3, sem horário de verão).
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "contact_phone, status, attendance_state, summary, started_at, last_message_at, closed_at, contact_reasons(name), messages(count)",
    )
    .eq("clinic_id", clinic.id)
    .gte("started_at", `${from}T00:00:00-03:00`)
    .lte("started_at", `${to}T23:59:59.999-03:00`)
    .order("started_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    console.error("[relatorios] exportar:", error.message);
    return new Response("Não foi possível exportar agora.", { status: 500 });
  }

  const header = [
    "Telefone",
    "Status",
    "Quem respondia",
    "Motivo do contato",
    "Resumo",
    "Mensagens",
    "Início",
    "Última mensagem",
    "Encerrada em",
  ];
  const lines = data.map((c) =>
    [
      c.contact_phone,
      STATUS[c.status],
      ATTENDANCE[c.attendance_state],
      c.contact_reasons?.name ??
        (c.status === "aberta" ? "" : "Sem motivo identificado"),
      c.summary ?? "",
      c.messages[0]?.count ?? 0,
      when(c.started_at),
      when(c.last_message_at),
      when(c.closed_at),
    ]
      .map(cell)
      .join(";"),
  );
  // BOM no começo: o Excel abre os acentos certos.
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversas-${from}-a-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
