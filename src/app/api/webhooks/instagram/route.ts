import { after, NextResponse, type NextRequest } from "next/server";

import {
  handleInstagramEvent,
  type InstagramEvent,
} from "@/lib/instagram/inbound";
import { isValidSignature } from "@/lib/whatsapp/client";

// A resposta à Meta sai na hora; a IA roda depois, dentro deste limite.
export const maxDuration = 60;

/** A Meta chama uma vez, ao cadastrar o webhook do Instagram, para confirmar que o endereço é nosso. */
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const verifyToken =
    process.env.INSTAGRAM_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim();
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
 * Mensagens do Direct e comentários. Responde 200 imediatamente e processa depois com after().
 * A assinatura vem com a chave do produto Instagram ou com a do app da Meta, conforme a
 * configuração: aceita qualquer uma das duas. Em produção, uma delas é obrigatória.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secrets = [
    process.env.INSTAGRAM_APP_SECRET?.trim(),
    process.env.META_APP_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  const signature = request.headers.get("x-hub-signature-256");
  if (secrets.length) {
    if (!secrets.some((secret) => isValidSignature(raw, signature, secret))) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  } else if (process.env.VERCEL_ENV === "production") {
    console.error(
      "[instagram] INSTAGRAM_APP_SECRET não configurado: aviso recusado.",
    );
    return NextResponse.json({ error: "not configured" }, { status: 401 });
  }

  let body: InstagramEvent;
  try {
    body = JSON.parse(raw) as InstagramEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  after(() => handleInstagramEvent(body));
  return NextResponse.json({ ok: true });
}
