// Sem "server-only": o proxy também usa esta regra.

/**
 * O acesso vale enquanto o período pago (ou a tolerância depois de uma cobrança recusada) não
 * acabou. O status não decide nada: uma assinatura cancelada continua valendo até o fim do período.
 */
export function isSubscriptionActive(
  sub: { current_period_end: string | null; grace_until: string | null },
  now = Date.now(),
) {
  const end = Math.max(
    sub.current_period_end ? Date.parse(sub.current_period_end) : 0,
    sub.grace_until ? Date.parse(sub.grace_until) : 0,
  );
  return end > now;
}
