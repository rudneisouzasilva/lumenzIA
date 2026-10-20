/**
 * Dados pedidos no agendamento
 * ----------------------------
 * O nome completo é sempre pedido e o telefone vem do próprio WhatsApp. A clínica escolhe se a
 * IA também pede e-mail, CPF e data de nascimento, e pode criar até 3 campos próprios de texto.
 * Usado no painel (configuração e exibição) e no servidor (IA e agenda).
 */

export const FIXED_FIELDS = ["email", "cpf", "data_nascimento"] as const;
export type FixedField = (typeof FIXED_FIELDS)[number];

export const FIXED_FIELD_LABELS: Record<FixedField, string> = {
  email: "E-mail",
  cpf: "CPF",
  data_nascimento: "Data de nascimento",
};

export const FIELD_MODES = ["desligado", "opcional", "obrigatorio"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

export const FIELD_MODE_LABELS: Record<FieldMode, string> = {
  desligado: "Não pedir",
  opcional: "Opcional",
  obrigatorio: "Obrigatório",
};

export const MAX_CUSTOM_FIELDS = 3;
export const MAX_CUSTOM_FIELD_NAME = 40;
export const MAX_CUSTOM_FIELD_VALUE = 200;

export type CustomField = { nome: string; obrigatorio: boolean };

export type BookingFields = Record<FixedField, FieldMode> & {
  personalizados: CustomField[];
};

/** O que a pessoa informou: no agendamento e no contato (appointments/contacts.patient_data). */
export type PatientData = Partial<Record<FixedField, string>> & {
  campos?: Record<string, string>;
};

export const DEFAULT_BOOKING_FIELDS: BookingFields = {
  email: "desligado",
  cpf: "desligado",
  data_nascimento: "desligado",
  personalizados: [],
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Lê a configuração gravada, ignorando o que não for válido. */
export function parseBookingFields(raw: unknown): BookingFields {
  const obj = isObject(raw) ? raw : {};
  const mode = (v: unknown): FieldMode =>
    FIELD_MODES.includes(v as FieldMode) ? (v as FieldMode) : "desligado";
  const custom = Array.isArray(obj.personalizados) ? obj.personalizados : [];
  return {
    email: mode(obj.email),
    cpf: mode(obj.cpf),
    data_nascimento: mode(obj.data_nascimento),
    personalizados: custom
      .filter(isObject)
      .map((c) => ({
        nome: String(c.nome ?? "")
          .trim()
          .slice(0, MAX_CUSTOM_FIELD_NAME),
        obrigatorio: c.obrigatorio === true,
      }))
      .filter((c) => c.nome)
      .slice(0, MAX_CUSTOM_FIELDS),
  };
}

export function parsePatientData(raw: unknown): PatientData {
  const obj = isObject(raw) ? raw : {};
  const out: PatientData = {};
  for (const key of FIXED_FIELDS) {
    if (typeof obj[key] === "string" && obj[key]) out[key] = obj[key];
  }
  if (isObject(obj.campos)) {
    const campos = Object.fromEntries(
      Object.entries(obj.campos).filter(
        (e): e is [string, string] => typeof e[1] === "string" && !!e[1],
      ),
    );
    if (Object.keys(campos).length) out.campos = campos;
  }
  return out;
}

/** CPF com os dois dígitos verificadores certos (só os 11 dígitos). */
export function isValidCpf(digits: string) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

export const formatCpf = (digits: string) =>
  digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

/** "AAAA-MM-DD" para "DD/MM/AAAA". */
export const formatBirthDate = (iso: string) =>
  iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");

/** Os dados em linhas "Rótulo: valor", na ordem da configuração, para a agenda e o painel. */
export function patientDataLines(data: PatientData) {
  const lines: [string, string][] = [];
  if (data.email) lines.push([FIXED_FIELD_LABELS.email, data.email]);
  if (data.cpf) lines.push([FIXED_FIELD_LABELS.cpf, formatCpf(data.cpf)]);
  if (data.data_nascimento) {
    lines.push([
      FIXED_FIELD_LABELS.data_nascimento,
      formatBirthDate(data.data_nascimento),
    ]);
  }
  for (const [name, value] of Object.entries(data.campos ?? {})) {
    lines.push([name, value]);
  }
  return lines;
}
