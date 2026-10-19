import { isoDateInBrasilia } from "@/lib/format";

export const PRESETS = [7, 30, 90] as const;
const MAX_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const valid = (v: unknown): v is string =>
  typeof v === "string" &&
  DATE.test(v) &&
  !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/**
 * Período do relatório a partir da URL: ?periodo=7|30|90 ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD.
 * Padrão: últimos 30 dias, contando hoje (no horário de Brasília). No máximo um ano.
 */
export function parsePeriod(
  params: Record<string, string | string[] | undefined>,
) {
  const today = isoDateInBrasilia();
  if (valid(params.de) && valid(params.ate) && params.de <= params.ate) {
    const from =
      shift(params.de, MAX_DAYS - 1) < params.ate
        ? shift(params.ate, -(MAX_DAYS - 1))
        : params.de;
    return { from, to: params.ate, preset: null };
  }
  const days = PRESETS.find((p) => String(p) === params.periodo) ?? 30;
  return { from: shift(today, -(days - 1)), to: today, preset: days };
}
