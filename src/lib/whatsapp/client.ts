import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Envio de mensagens pela WhatsApp Cloud API (Meta), com o número e o token de cada clínica. */

export type Sender = { phoneNumberId: string; accessToken: string };

function apiVersion() {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
}

async function send(sender: Sender, payload: Record<string, unknown>) {
  const res = await fetch(
    `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(sender.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...payload,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) {
    throw new Error(
      `WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
}

export function sendText(sender: Sender, to: string, text: string) {
  return send(sender, {
    to,
    type: "text",
    text: { body: text.slice(0, 4000), preview_url: false },
  });
}

/** A foto precisa estar num endereço público: o WhatsApp baixa pelo link. */
export function sendImage(sender: Sender, to: string, link: string) {
  return send(sender, { to, type: "image", image: { link } });
}

/**
 * Template aprovado na Meta, o único jeito de escrever fora da janela de 24 horas (avisos para a
 * equipe, lembretes). Nome, idioma e quantidade de variáveis precisam bater com o aprovado.
 */
export function sendTemplate(
  sender: Sender,
  to: string,
  name: string,
  language: string,
  bodyParams: string[],
) {
  return send(sender, {
    to,
    type: "template",
    template: {
      name,
      language: { code: language || "pt_BR" },
      ...(bodyParams.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  });
}

/** Confere que o aviso veio mesmo da Meta (cabeçalho X-Hub-Signature-256, com o App Secret). */
export function isValidSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
) {
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
