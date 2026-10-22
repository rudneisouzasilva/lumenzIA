import { after, NextResponse, type NextRequest } from "next/server";

import { syncClinicAgenda } from "@/lib/jobs/agenda-sync";
import { createAdminClient } from "@/lib/supabase/admin";

// A resposta ao Clínica Experts sai na hora; a sincronização roda depois, dentro deste limite.
export const maxDuration = 30;

const ok = () => NextResponse.json({ ok: true });

/** Alguns sistemas testam o endereço com um GET antes de salvar o webhook. */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/api/webhooks/clinica-experts/[token]">,
) {
  const { token } = await params;
  return (await findAccount(token))
    ? ok()
    : new Response("not found", { status: 404 });
}

async function findAccount(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("clinica_experts_accounts")
    .select("clinic_id, status")
    .eq("webhook_token", token)
    .maybeSingle()
    .throwOnError();
  return data;
}

/** O nome do evento ("booking.created"...), onde quer que ele venha no corpo. */
function eventName(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const obj = body as Record<string, unknown>;
  for (const key of ["event", "type", "name", "action"]) {
    if (typeof obj[key] === "string") return obj[key];
  }
  return "";
}

/**
 * Aviso do Clínica Experts: o código no endereço diz de qual clínica é. Para qualquer mudança
 * de agendamento, relê a agenda dos próximos dias pela API (a fonte da verdade), em vez de
 * confiar no conteúdo do aviso, que a documentação não detalha.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/webhooks/clinica-experts/[token]">,
) {
  const { token } = await params;
  const account = await findAccount(token);
  if (!account) return new Response("not found", { status: 404 });

  const body = await request.json().catch(() => null);
  const event = eventName(body);
  // Pacientes, profissionais, salas...: não mexem na agenda.
  if (event && !event.startsWith("booking.")) return ok();

  const admin = createAdminClient();
  await admin
    .from("clinica_experts_accounts")
    .update({ last_webhook_at: new Date().toISOString() })
    .eq("clinic_id", account.clinic_id);
  if (account.status !== "ativo") return ok();

  after(async () => {
    try {
      const { data: integration } = await admin
        .from("integrations")
        .select("*")
        .eq("clinic_id", account.clinic_id)
        .eq("mode", "clinica_experts")
        .eq("enabled", true)
        .maybeSingle()
        .throwOnError();
      if (!integration) return;
      const result = await syncClinicAgenda(integration);
      if (result.erro) {
        console.warn(
          `[clinica experts] webhook ${event || "sem evento"}: ${result.erro}`,
        );
      }
    } catch (e) {
      console.error("[clinica experts] webhook:", (e as Error).message);
    }
  });
  return ok();
}
