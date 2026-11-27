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

/**
 * Public Key do Mercado Pago (não é segredo: vai para o navegador). Com ela, a pessoa digita o
 * cartão na própria LumenzIA e não precisa ter conta no Mercado Pago. Sem ela, o pagamento abre
 * a página do Mercado Pago, que exige entrar com o mesmo e-mail da conta da LumenzIA.
 */
export function getMpPublicKey(): string | null {
  return process.env.MP_PUBLIC_KEY?.trim() || null;
}
