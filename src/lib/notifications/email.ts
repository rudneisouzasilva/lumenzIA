import "server-only";

/**
 * E-mails da LumenzIA (avisos à equipe e lembretes) pela API do Resend. É a mesma conta usada no
 * SMTP do Supabase, com o domínio próprio verificado lá.
 */

const RESEND_URL = "https://api.resend.com/emails";

function config() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFY_EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** "LumenzIA <avisos@x.com>" + "Clínica Bella" → "Clínica Bella <avisos@x.com>". */
function withName(from: string, name: string) {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const clean = name
    .replace(/["<>\r\n]/g, "")
    .trim()
    .slice(0, 60);
  return clean ? `"${clean}" <${address}>` : from;
}

/** Dá para mandar e-mail? (RESEND_API_KEY e NOTIFY_EMAIL_FROM na Vercel) */
export function emailConfigured() {
  return config() !== null;
}

/**
 * `fromName` troca o nome que aparece como remetente (ex.: o nome da clínica), mantendo o endereço
 * de NOTIFY_EMAIL_FROM.
 */
export async function sendEmail({
  to,
  subject,
  text,
  fromName,
}: {
  to: string;
  subject: string;
  text: string;
  fromName?: string;
}) {
  const cfg = config();
  if (!cfg) {
    throw new Error(
      "E-mail não configurado (RESEND_API_KEY e NOTIFY_EMAIL_FROM).",
    );
  }
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromName ? withName(cfg.from, fromName) : cfg.from,
      to: [to],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Resend ${response.status}: ${detail}`);
  }
}
