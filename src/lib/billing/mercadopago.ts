import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const MP_API = "https://api.mercadopago.com";

/** Resposta de erro do Mercado Pago, com o status HTTP para separar recusa de falha da API. */
export class MpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Mercado Pago ${status}: ${body.slice(0, 300)}`);
  }
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    // Sem resposta em 15 segundos, desiste: o webhook responde erro e o Mercado Pago reenvia.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new MpError(res.status, await res.text());
  return res.json() as Promise<T>;
}

export type MpPreapprovalStatus =
  "pending" | "authorized" | "paused" | "cancelled";

type Preapproval = {
  id: string;
  status: MpPreapprovalStatus;
  init_point: string;
};

/**
 * Cria a assinatura recorrente (preapproval) sem plano do Mercado Pago: nome e preço vivem só em
 * public.plans, então mudar o preço lá não exige mexer no Mercado Pago.
 *  - Sem cartão: fica pendente e devolve a página onde a pessoa autoriza a cobrança (ela precisa
 *    entrar no Mercado Pago com o mesmo e-mail).
 *  - Com cardTokenId (cartão digitado na LumenzIA): já nasce autorizada e a primeira cobrança sai
 *    em seguida; o resultado chega pelo webhook. Não exige conta no Mercado Pago.
 */
export async function createPreapproval(input: {
  subscriptionId: string;
  planName: string;
  priceCents: number;
  payerEmail: string;
  backUrl: string;
  cardTokenId?: string;
}) {
  const created = await mpFetch<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `${input.planName} - LumenzIA`,
      external_reference: input.subscriptionId,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.priceCents / 100,
        currency_id: "BRL",
      },
      ...(input.cardTokenId
        ? { card_token_id: input.cardTokenId, status: "authorized" }
        : {}),
    }),
  });
  return { id: created.id, initPoint: created.init_point };
}

export function getPreapproval(id: string) {
  return mpFetch<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
}

/** Para as próximas cobranças automáticas (o período já pago continua valendo). */
export function cancelPreapproval(id: string) {
  return mpFetch<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/** Uma cobrança mensal de uma assinatura (evento subscription_authorized_payment). */
export type AuthorizedPayment = {
  id: number | string;
  preapproval_id: string;
  status: "scheduled" | "processed" | "recycling" | "cancelled" | string;
  transaction_amount?: number;
  /** A tentativa de cobrança no cartão (approved, rejected, in_process...). */
  payment?: { id?: number | string; status?: string } | null;
};

export function getAuthorizedPayment(id: string) {
  return mpFetch<AuthorizedPayment>(
    `/authorized_payments/${encodeURIComponent(id)}`,
  );
}

/**
 * Confere a assinatura do webhook (cabeçalho x-signature) com a chave secreta configurada no
 * painel do Mercado Pago. https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function isValidWebhookSignature(input: {
  secret: string;
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  if (!input.signature) return false;
  const parts = Object.fromEntries(
    input.signature.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key.trim(), rest.join("=").trim()];
    }),
  );
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;

  let manifest = "";
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", input.secret)
    .update(manifest)
    .digest("hex");
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Mensagem para a pessoa quando o Mercado Pago recusa criar a assinatura com o cartão. Recusas do
 * cartão vêm como 4xx; o resto é falha do lado do Mercado Pago.
 */
export function cardErrorMessage(e: unknown) {
  if (e instanceof MpError && e.status >= 400 && e.status < 500) {
    if (/payer_email|email/i.test(e.body) && !/card/i.test(e.body)) {
      return "O Mercado Pago não aceitou o e-mail informado. Confira o e-mail e tente de novo.";
    }
    return "O cartão foi recusado. Confira os dados ou tente outro cartão. Se o banco bloqueou por segurança, libere a compra no app do banco e tente de novo.";
  }
  return "O Mercado Pago não respondeu. Tente novamente em alguns instantes.";
}
