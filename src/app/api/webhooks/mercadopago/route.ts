import { NextResponse, type NextRequest } from "next/server";

import { getPaymentMode } from "@/lib/billing/config";
import {
  getAuthorizedPayment,
  getPreapproval,
  isValidWebhookSignature,
} from "@/lib/billing/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notificações de assinatura do Mercado Pago. O corpo não é confiável: usamos só o tipo e o id e
 * buscamos os dados na API do Mercado Pago.
 *  - subscription_preapproval: a autorização mudou (autorizada, pausada, cancelada). Só atualiza o
 *    status; não libera acesso.
 *  - subscription_authorized_payment: uma cobrança mensal foi processada. É ela que libera (ou não)
 *    o próximo ciclo.
 * Responde 500 quando algo falha, para o Mercado Pago tentar de novo (aplicar é idempotente).
 */
export async function POST(request: NextRequest) {
  let mode;
  try {
    mode = getPaymentMode();
  } catch {
    mode = null;
  }
  if (mode !== "mercadopago") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    data?: { id?: string | number };
  };
  const query = request.nextUrl.searchParams;
  const type = body.type ?? query.get("type") ?? query.get("topic");
  const id = String(
    body.data?.id ?? query.get("data.id") ?? query.get("id") ?? "",
  );

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (
    secret &&
    !isValidWebhookSignature({
      secret,
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: query.get("data.id") ?? (id || null),
    })
  ) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (!id) return NextResponse.json({ ok: true });

  try {
    if (type === "subscription_preapproval") {
      await syncPreapproval(id);
    } else if (type === "subscription_authorized_payment") {
      await applyAuthorizedPayment(id);
    }
  } catch (e) {
    console.error(`[mercadopago] ${type} ${id}:`, (e as Error).message);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function syncPreapproval(preapprovalId: string) {
  const preapproval = await getPreapproval(preapprovalId);
  await createAdminClient()
    .from("subscriptions")
    .update({ status: preapproval.status })
    .eq("mp_preapproval_id", preapprovalId)
    .throwOnError();
}

async function applyAuthorizedPayment(authorizedPaymentId: string) {
  const payment = await getAuthorizedPayment(authorizedPaymentId);
  // Cada tentativa de cobrança gera um pagamento próprio (payment.id): uma recusa seguida de uma
  // nova tentativa aprovada conta como dois registros, e o mesmo aviso reenviado, como um só.
  const attempt = payment.payment;
  let approved: boolean;
  if (attempt?.status === "approved") approved = true;
  else if (
    attempt?.status === "rejected" ||
    payment.status === "recycling" ||
    payment.status === "cancelled"
  )
    approved = false;
  else return; // agendada ou ainda em processamento
  const providerPaymentId = attempt?.id
    ? String(attempt.id)
    : `${payment.id}-${payment.status}`;

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("mp_preapproval_id", payment.preapproval_id)
    .maybeSingle()
    .throwOnError();
  if (!sub) return; // assinatura de outro ambiente: ignora

  await admin
    .rpc("apply_subscription_payment", {
      p_subscription_id: sub.id,
      p_provider_payment_id: providerPaymentId,
      p_amount_cents: Math.round((payment.transaction_amount ?? 0) * 100),
      p_approved: approved,
    })
    .throwOnError();
}
