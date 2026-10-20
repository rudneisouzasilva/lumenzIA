import { after, NextResponse, type NextRequest } from "next/server";

import { isValidSignature } from "@/lib/whatsapp/client";
import {
  handleWhatsappEvent,
  type WhatsappEvent,
} from "@/lib/whatsapp/inbound";
import { applyTemplateStatus } from "@/lib/whatsapp/templates";

// A resposta à Meta sai na hora; a IA roda depois, dentro deste limite.
export const maxDuration = 60;

/** A Meta chama uma vez, ao cadastrar o webhook, para confirmar que o endereço é nosso. */
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    query.get("hub.mode") === "subscribe" &&
    verifyToken &&
    query.get("hub.verify_token") === verifyToken
  ) {
    return new Response(query.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/**
 * Mensagens recebidas e status de entrega. Responde 200 imediatamente (a Meta reenvia o que
 * demora) e processa depois com after(). Em produção a assinatura da Meta é obrigatória.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    if (
      !isValidSignature(
        raw,
        request.headers.get("x-hub-signature-256"),
        appSecret,
      )
    ) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  } else if (process.env.VERCEL_ENV === "production") {
    console.error(
      "[whatsapp] META_APP_SECRET não configurado: aviso recusado.",
    );
    return NextResponse.json({ error: "not configured" }, { status: 401 });
  }

  let body: WhatsappEvent;
  try {
    body = JSON.parse(raw) as WhatsappEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  after(() => handleWhatsappEvent(body, applyTemplateStatus));
  return NextResponse.json({ ok: true });
}
