/** R$ 197 (sem centavos quando redondo) ou R$ 197,50. */
export function formatPrice(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** 19 de novembro de 2026 */
export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

const TZ = "America/Sao_Paulo";

/** 5541999998888 → +55 41 99999-8888 (números de fora do Brasil ficam só com o +). */
export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return br ? `+55 ${br[1]} ${br[2]}-${br[3]}` : `+${digits}`;
}

/** 19/10, 14:30 */
export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(value));
}

/** 14:30 */
export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(value));
}

/** "agora", "há 5 min", "há 3 h", "ontem" ou a data, para listas de conversas. */
export function formatRelative(value: string | Date, now = Date.now()) {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 24 * 60) return `há ${Math.floor(minutes / 60)} h`;
  if (minutes < 48 * 60) return "ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ,
  }).format(new Date(value));
}

/** Data de hoje (ou de `date`) no horário de Brasília, no formato AAAA-MM-DD. */
export function isoDateInBrasilia(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

/** "(41) 99999-0000" → "5541999990000". Sem o código do país, considera Brasil. */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return /^\d{12,15}$/.test(digits) ? digits : null;
}
