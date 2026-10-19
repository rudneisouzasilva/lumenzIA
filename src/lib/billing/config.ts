import "server-only";

export type PaymentMode = "mock" | "mercadopago";

/**
 * "mock" simula a cobrança (nada é cobrado) e é o padrão; "mercadopago" cobra de verdade. O
 * modo de teste é recusado no deploy de produção da Vercel.
 */
export function getPaymentMode(): PaymentMode {
  const mode = (process.env.PAYMENT_MODE ?? "mock").trim().toLowerCase();
  if (mode !== "mock" && mode !== "mercadopago") {
    throw new Error('PAYMENT_MODE deve ser "mock" ou "mercadopago".');
  }
  if (mode === "mock" && process.env.VERCEL_ENV === "production") {
    throw new Error('Em produção, PAYMENT_MODE precisa ser "mercadopago".');
  }
  if (mode === "mercadopago" && !process.env.MP_ACCESS_TOKEN) {
    throw new Error("Falta MP_ACCESS_TOKEN para cobrar pelo Mercado Pago.");
  }
  return mode;
}
