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

/** O que a tela "Lembretes e avisos" salva (conferido de novo na Server Action). */
export type NotificationSettings = {
  /** Quantas horas antes do horário o lembrete sai (0 = sem lembrete). */
  reminderHoursBefore: number;
  channels: StaffChannel[];
  /** WhatsApp da equipe, como a pessoa digitou. */
  phone: string;
  email: string;
  reminderByEmail: boolean;
};

export const isEmail = (v: string) =>
  v.length <= MAX_STAFF_EMAIL && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
