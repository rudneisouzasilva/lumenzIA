/**
 * Canais dos avisos à equipe
 * --------------------------
 * Avisos à equipe (paciente pedindo atendimento, cota do plano acabou) podem ir pelo WhatsApp e
 * por e-mail, como a clínica escolher. Usado no painel (configuração) e no servidor (envio).
 */

export const STAFF_CHANNELS = ["whatsapp", "email"] as const;
export type StaffChannel = (typeof STAFF_CHANNELS)[number];

export const CHANNEL_LABELS: Record<StaffChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
};

/** Lê os canais gravados, sem repetição e na ordem de STAFF_CHANNELS. */
export function parseStaffChannels(raw: unknown): StaffChannel[] {
  const list = Array.isArray(raw) ? raw : [];
  return STAFF_CHANNELS.filter((c) => list.includes(c));
}

export const MAX_STAFF_EMAIL = 254;

/** Quantos WhatsApps da equipe a clínica pode cadastrar. */
export const MAX_STAFF_PHONES = 5;

/** O que a tela "Lembretes e avisos" salva (conferido de novo na Server Action). */
export type NotificationSettings = {
  /** Quantas horas antes do horário o lembrete sai (0 = sem lembrete). */
  reminderHoursBefore: number;
  channels: StaffChannel[];
  /** WhatsApps da equipe (até MAX_STAFF_PHONES), como a pessoa digitou. */
  phones: string[];
  email: string;
  reminderByEmail: boolean;
};

export const isEmail = (v: string) =>
  v.length <= MAX_STAFF_EMAIL && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
