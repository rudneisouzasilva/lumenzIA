import "server-only";

import { headers } from "next/headers";

/**
 * Endereço público do site, para links em e-mails e retornos do Mercado Pago. Usa
 * NEXT_PUBLIC_APP_URL quando definida; senão, o endereço pelo qual a requisição chegou.
 */
export async function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Aceita só caminhos internos ("/assinatura"), nunca outro site ("//x.com", "https://..."). */
export function safeNextPath(value: unknown, fallback = "/assinatura") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}
