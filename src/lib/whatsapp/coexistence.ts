import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  clinicByPhoneNumberId,
  DEFAULT_CONVERSATION_TIMEOUT_HOURS,
  findOrCreateConversation,
  whatsappTime,
} from "./conversations";
import { messageText } from "./message-text";

/**
 * Coexistência com o app WhatsApp Business
 * ----------------------------------------
 * A clínica continua usando o app no celular depois de conectar o número. A Meta avisa o nosso
 * webhook de três coisas, e tudo vira histórico no painel:
 *  - history: conversas dos últimos 6 meses, em partes, logo depois da conexão (se a clínica
 *    aceitou compartilhar no celular);
 *  - smb_message_echoes: cada mensagem que alguém da equipe manda pelo app, na hora;
 *  - smb_app_state_sync: os contatos salvos no app (nome de cada telefone).
 */

type Admin = SupabaseClient<Database>;

type WaMessage = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
};

export type HistoryChunk = {
  metadata?: { phase?: number; chunk_order?: number; progress?: number };
  threads?: { id?: string; messages?: WaMessage[] }[];
  errors?: { code?: number; title?: string; message?: string }[];
};

export type MessageEcho = WaMessage;

export type ContactSync = {
  type?: string;
  action?: string;
  contact?: { full_name?: string; first_name?: string; phone_number?: string };
};

/** A clínica não aceitou compartilhar o histórico no app. */
const HISTORY_DECLINED = 2593109;

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function handleHistory(
  admin: Admin,
  phoneNumberId: string,
  chunks: HistoryChunk[],
) {
  const clinic = await clinicByPhoneNumberId(admin, phoneNumberId);
  if (!clinic) return;
  const gapMs =
    (clinic.conversation_timeout_hours ?? DEFAULT_CONVERSATION_TIMEOUT_HOURS) *
    3600_000;

  for (const chunk of chunks) {
    if (chunk.errors?.length) {
      const declined = chunk.errors.some((e) => e.code === HISTORY_DECLINED);
      console.warn(
        `[whatsapp] histórico da clínica ${clinic.id}:`,
        chunk.errors.map((e) => `${e.code} ${e.title ?? e.message}`).join("|"),
      );
      await admin
        .from("clinics")
        .update({ whatsapp_history_status: declined ? "recusado" : "erro" })
        .eq("id", clinic.id)
        .throwOnError();
      continue;
    }

    let imported = 0;
    for (const thread of chunk.threads ?? []) {
      const phone = digits(thread.id);
      if (!/^\d{8,15}$/.test(phone)) continue;
      try {
        imported += await importThread(
          admin,
          clinic.id,
          phone,
          thread.messages ?? [],
          gapMs,
        );
      } catch (e) {
        console.error(
          `[whatsapp] importar conversa de ${phone}:`,
          (e as Error).message,
        );
      }
    }
    await admin
      .rpc("add_history_progress", {
        p_clinic_id: clinic.id,
        p_messages: imported,
        p_progress: Math.round(Number(chunk.metadata?.progress ?? 0)),
      })
      .throwOnError();
  }
}

type Session = {
  id: number | null;
  start: number;
  end: number;
  rows: Database["public"]["Tables"]["messages"]["Insert"][];
};

/**
 * Guarda as mensagens antigas de um contato, agrupadas em conversas pelo mesmo tempo limite do
 * atendimento ao vivo. As partes podem se repetir: o id da Meta não deixa duplicar.
 */
async function importThread(
  admin: Admin,
  clinicId: string,
  phone: string,
  messages: WaMessage[],
  gapMs: number,
) {
  const items = messages
    .map((m) => ({ m, at: Date.parse(whatsappTime(m.timestamp) ?? "") }))
    .filter((x) => x.m.id && Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at);
  if (!items.length) return 0;

  const { data: existing } = await admin
    .from("conversations")
    .select("id, started_at, last_message_at")
    .eq("clinic_id", clinicId)
    .eq("contact_phone", phone)
    .eq("imported", true)
    .throwOnError();
  const sessions: Session[] = existing.map((c) => ({
    id: c.id,
    start: Date.parse(c.started_at),
    end: Date.parse(c.last_message_at),
    rows: [],
  }));

  for (const { m, at } of items) {
    let session = sessions.find(
      (s) => at >= s.start - gapMs && at <= s.end + gapMs,
    );
    if (!session) {
      session = { id: null, start: at, end: at, rows: [] };
      sessions.push(session);
    }
    session.start = Math.min(session.start, at);
    session.end = Math.max(session.end, at);
    const fromPatient = digits(m.from) === phone;
    session.rows.push({
      clinic_id: clinicId,
      conversation_id: 0, // preenchido abaixo
      contact_phone: phone,
      role: fromPatient ? "user" : "staff",
      origin: "historico",
      content: messageText(m).slice(0, 2000) || "Mensagem",
      wa_message_id: m.id!,
      created_at: new Date(at).toISOString(),
    });
  }

  let inserted = 0;
  for (const session of sessions) {
    if (!session.rows.length) continue;
    const bounds = {
      started_at: new Date(session.start).toISOString(),
      last_message_at: new Date(session.end).toISOString(),
      closed_at: new Date(session.end).toISOString(),
    };
    if (session.id === null) {
      const { data } = await admin
        .from("conversations")
        .insert({
          clinic_id: clinicId,
          contact_phone: phone,
          status: "concluida",
          attendance_state: "equipe",
          imported: true,
          needs_classification: true,
          ...bounds,
        })
        .select("id")
        .single()
        .throwOnError();
      session.id = data.id;
    } else {
      await admin
        .from("conversations")
        .update({ ...bounds, needs_classification: true })
        .eq("id", session.id)
        .throwOnError();
    }
    const { data: saved } = await admin
      .from("messages")
      .upsert(
        session.rows.map((r) => ({ ...r, conversation_id: session.id! })),
        { onConflict: "wa_message_id", ignoreDuplicates: true },
      )
      .select("id")
      .throwOnError();
    inserted += saved.length;
  }
  return inserted;
}

/**
 * Mensagem que alguém da equipe mandou pelo app do celular: entra na conversa e pausa a IA,
 * como se tivesse respondido pelo painel.
 */
export async function handleMessageEchoes(
  admin: Admin,
  phoneNumberId: string,
  echoes: MessageEcho[],
) {
  const clinic = await clinicByPhoneNumberId(admin, phoneNumberId);
  if (!clinic) return;

  for (const echo of echoes) {
    const to = digits(echo.to);
    if (!/^\d{8,15}$/.test(to) || !echo.id) continue;
    try {
      const conversation = await findOrCreateConversation(
        admin,
        clinic,
        to,
        "equipe",
      );
      const { error } = await admin.from("messages").insert({
        clinic_id: clinic.id,
        conversation_id: conversation.id,
        contact_phone: to,
        role: "staff",
        origin: "celular",
        content: messageText(echo).slice(0, 4000) || "Mensagem",
        wa_message_id: echo.id,
        created_at: whatsappTime(echo.timestamp),
      });
      if (error?.code === "23505") continue;
      if (error) throw new Error(error.message);
      await admin
        .from("conversations")
        .update({
          attendance_state: "equipe",
          needs_human_at: null,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)
        .throwOnError();
    } catch (e) {
      console.error(
        `[whatsapp] mensagem do celular para ${to}:`,
        (e as Error).message,
      );
    }
  }
}

/** Contatos salvos no app: o nome vira o nome do contato (se a equipe não deu outro). */
export async function handleContactsSync(
  admin: Admin,
  phoneNumberId: string,
  items: ContactSync[],
) {
  const clinic = await clinicByPhoneNumberId(admin, phoneNumberId);
  if (!clinic) return;
  for (const item of items) {
    if (item.type !== "contact" || item.action === "remove") continue;
    const phone = digits(item.contact?.phone_number);
    const name = (item.contact?.full_name || item.contact?.first_name || "")
      .trim()
      .slice(0, 120);
    if (!/^\d{8,15}$/.test(phone)) continue;
    const { error } = await admin.rpc("ensure_contact", {
      p_clinic_id: clinic.id,
      p_phone: phone,
      p_name: name,
    });
    if (error) console.error("[whatsapp] contato do app:", error.message);
  }
}
