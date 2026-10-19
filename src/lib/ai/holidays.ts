/**
 * Feriados nacionais do Brasil, calculados aqui mesmo (sem API externa). Feriados estaduais e
 * municipais variam demais e ficam no campo "Outros fechamentos", que a própria clínica preenche.
 */

/** Domingo de Páscoa pelo algoritmo de Gauss (calendário gregoriano). */
function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const FIXED_HOLIDAYS: [month: number, day: number, name: string][] = [
  [1, 1, "Confraternização Universal"],
  [4, 21, "Tiradentes"],
  [5, 1, "Dia do Trabalho"],
  [9, 7, "Independência do Brasil"],
  [10, 12, "Nossa Senhora Aparecida"],
  [11, 2, "Finados"],
  [11, 15, "Proclamação da República"],
  [11, 20, "Dia da Consciência Negra"],
  [12, 25, "Natal"],
];

/** Feriados nacionais de um ano: os fixos e os móveis, que dependem da Páscoa. */
export function nationalHolidays(year: number) {
  const list = FIXED_HOLIDAYS.map(([month, day, name]) => ({
    month,
    day,
    name,
  }));
  const pascoa = easter(year);
  for (const [date, name] of [
    [addDays(pascoa, -47), "Carnaval"],
    [addDays(pascoa, -2), "Sexta-feira Santa"],
    [addDays(pascoa, 60), "Corpus Christi"],
  ] as const) {
    list.push({
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      name,
    });
  }
  return list;
}

/** Nome do feriado nacional nesta data (no horário de Brasília), ou null. */
export function nationalHolidayOn(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return (
    nationalHolidays(year).find((h) => h.month === month && h.day === day)
      ?.name ?? null
  );
}
