import "server-only";

import {
  FIXED_FIELD_LABELS,
  FIXED_FIELDS,
  isValidCpf,
  MAX_CUSTOM_FIELD_VALUE,
  type BookingFields,
  type FixedField,
  type PatientData,
} from "@/lib/booking-fields";

import type { AgendaResult } from "./agenda";

/**
 * Dados da pessoa no agendamento
 * ------------------------------
 * Antes de "criar_agendamento", confere e padroniza os dados que a clínica pede (e-mail, CPF,
 * data de nascimento e os campos próprios), completa com o que a pessoa já informou em um
 * agendamento anterior e barra o pedido se faltar algo obrigatório, para a IA perguntar.
 */

/** Os campos próprios chegam da IA como campo_1, campo_2 e campo_3 (o nome vai na descrição). */
export const customFieldKey = (index: number) => `campo_${index + 1}`;

/** As propriedades extras da ferramenta "criar_agendamento", conforme a configuração. */
export function bookingToolProperties(fields: BookingFields) {
  const props: Record<string, { type: "string"; description: string }> = {};
  if (fields.email !== "desligado") {
    props.email = { type: "string", description: "E-mail da pessoa atendida." };
  }
  if (fields.cpf !== "desligado") {
    props.cpf = {
      type: "string",
      description: "CPF da pessoa atendida (11 dígitos, com ou sem pontuação).",
    };
  }
  if (fields.data_nascimento !== "desligado") {
    props.data_nascimento = {
      type: "string",
      description: "Data de nascimento da pessoa atendida, formato AAAA-MM-DD.",
    };
  }
  fields.personalizados.forEach((c, i) => {
    props[customFieldKey(i)] = {
      type: "string",
      description: `${c.nome} (resposta da pessoa, em poucas palavras).`,
    };
  });
  return props;
}

const text = (v: unknown) => (v == null ? "" : String(v).trim());

function normalizeEmail(raw: string) {
  const email = raw.toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
    ? email
    : null;
}

function normalizeCpf(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return isValidCpf(digits) ? digits : null;
}

/** "AAAA-MM-DD", "DD/MM/AAAA" ou "DD-MM-AAAA" para "AAAA-MM-DD", se for uma data possível. */
function normalizeBirthDate(raw: string, now: Date) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  const [y, m, d] = iso
    ? [iso[1], iso[2], iso[3]].map(Number)
    : br
      ? [br[3], br[2], br[1]].map(Number)
      : [NaN, NaN, NaN];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    date > now ||
    y < now.getUTCFullYear() - 120
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

const NORMALIZE: Record<FixedField, (raw: string, now: Date) => string | null> =
  {
    email: normalizeEmail,
    cpf: normalizeCpf,
    data_nascimento: normalizeBirthDate,
  };

const INVALID: Record<FixedField, string> = {
  email: "O e-mail informado não parece válido.",
  cpf: "O CPF informado não é válido (os dígitos não conferem).",
  data_nascimento:
    "A data de nascimento informada não é uma data válida (use AAAA-MM-DD).",
};

const list = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`
    : (items[0] ?? "");

/**
 * Confere os dados de "criar_agendamento" e deixa em `args` só os padronizados: email, cpf,
 * data_nascimento e campos ({ "Alergias": "..." }). `known` é o que a própria pessoa já informou
 * antes (vazio quando o agendamento é para outra pessoa). Devolve { erro } para a IA, ou null.
 */
export function preparePatientData(
  fields: BookingFields,
  args: Record<string, unknown>,
  known: PatientData,
  now = new Date(),
): AgendaResult | null {
  const missing: string[] = [];

  for (const key of FIXED_FIELDS) {
    const raw = text(args[key]);
    delete args[key];
    const mode = fields[key];
    if (mode === "desligado") continue;
    if (raw) {
      const value = NORMALIZE[key](raw, now);
      if (!value) {
        return {
          motivo: "dado_invalido",
          campo: key,
          erro:
            mode === "obrigatorio"
              ? `${INVALID[key]} Peça para a pessoa conferir antes de agendar.`
              : `${INVALID[key]} Peça para a pessoa conferir ou, se ela preferir não informar, agende sem este dado.`,
        };
      }
      args[key] = value;
    } else if (known[key]) {
      args[key] = known[key];
    } else if (mode === "obrigatorio") {
      missing.push(FIXED_FIELD_LABELS[key]);
    }
  }

  const campos: Record<string, string> = {};
  fields.personalizados.forEach((c, i) => {
    const key = customFieldKey(i);
    const value = text(args[key]).slice(0, MAX_CUSTOM_FIELD_VALUE);
    delete args[key];
    const saved = value || known.campos?.[c.nome];
    if (saved) campos[c.nome] = saved;
    else if (c.obrigatorio) missing.push(c.nome);
  });
  delete args.campos;
  if (Object.keys(campos).length) args.campos = campos;

  if (!text(args.nome_paciente)) missing.unshift("nome completo");

  if (missing.length) {
    return {
      motivo: "dados_faltando",
      erro: `Para agendar, a clínica precisa de: ${list(missing)}. Peça à pessoa (tudo em uma mensagem só) e tente de novo.`,
    };
  }
  return null;
}

/** Os campos que a clínica pede e esta pessoa já informou, para a IA não perguntar de novo. */
export function knownFieldNames(fields: BookingFields, known: PatientData) {
  return [
    ...FIXED_FIELDS.filter((k) => fields[k] !== "desligado" && known[k]).map(
      (k) => FIXED_FIELD_LABELS[k],
    ),
    ...fields.personalizados
      .filter((c) => known.campos?.[c.nome])
      .map((c) => c.nome),
  ];
}
