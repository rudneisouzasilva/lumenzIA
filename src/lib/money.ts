/**
 * "197", "197,5", "1.297,90", "R$ 1.297,90" ou "197.90" → centavos; null se não for um valor.
 * Com vírgula, ela é o decimal e os pontos são milhar; sem vírgula, um ponto com 1 ou 2 dígitos
 * no fim é decimal.
 */
export function parseReais(raw: string): number | null {
  let text = raw.replace(/[R$\s]/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replaceAll(".", "").replace(",", ".");
  else if (!/\.\d{1,2}$/.test(text)) text = text.replaceAll(".", "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}
