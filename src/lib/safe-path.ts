// Sem "server-only": o proxy também usa esta regra.

/**
 * Aceita só caminhos internos ("/painel"), nunca outro site ("//x.com", "/\x.com",
 * "https://..."). O navegador lê a barra invertida como barra normal, então "/\x.com" levaria
 * para fora do site.
 */
export function safeNextPath(value: unknown, fallback = "/painel") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}
