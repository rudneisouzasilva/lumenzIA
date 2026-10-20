import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateReply,
  loadAssistantContext,
  type ChatTurn,
} from "@/lib/ai/engine";
import {
  pickActiveSubscription,
  type SubscriptionRow,
} from "@/lib/billing/subscription";
import { publicImageUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { sendImage, sendText, type Sender } from "./client";
import {
  handleContactsSync,
  handleHistory,
  handleMessageEchoes,
  type ContactSync,
  type HistoryChunk,
  type MessageEcho,
} from "./coexistence";
import {
  clinicByPhoneNumberId,
  findOrCreateConversation,
  whatsappTime,
  type InboundClinic,
} from "./conversations";
import { handlePartnerRemoved } from "./embedded-signup";
import { messageText } from "./message-text";
import { sendTemplateMessage, templateFor } from "./templates";

export { DEFAULT_CONVERSATION_TIMEOUT_HOURS } from "./conversations";

const HISTORY_SIZE = 20;

type Admin = SupabaseClient<Database>;

export type InboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

export type WhatsappEvent = {
  object?: string;
  entry?: {
    id?: string; // a conta do WhatsApp Business (WABA)
    changes?: {
      field?: string;
      value?: {
        event?: string; // field = "account_update" ou "message_template_status_update"
        waba_info?: { waba_id?: string };
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: InboundMessage[];
        statuses?: {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string }[];
        }[];
        // Coexistência com o app WhatsApp Business
        history?: HistoryChunk[];
        message_echoes?: MessageEcho[];
        state_sync?: ContactSync[];
        // Status dos templates (mensagens prontas)
        message_template_id?: number | string;
        message_template_name?: string;
        message_template_language?: string;
        reason?: string | null;
      };
    }[];
  }[];
};

export type TemplateStatusEvent = {
  wabaId: string | undefined;
  templateId: string;
  status: string;
  reason: string | null;
};

/**
 * Processa um aviso do webhook do WhatsApp: mensagens recebidas, falhas de entrega e, na
 * coexistência, o histórico e as mensagens que a equipe manda pelo celular. Roda depois de
 * responder 200 à Meta, então cada falha é só registrada no log.
 */
export async function handleWhatsappEvent(
  body: WhatsappEvent,
  onTemplateStatus?: (event: TemplateStatusEvent) => Promise<void>,
) {
  if (body?.object !== "whatsapp_business_account") return;
  const admin = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id;

      try {
        if (change.field === "account_update") {
          const wabaId = value.waba_info?.waba_id ?? entry.id;
          if (value.event === "PARTNER_REMOVED" && wabaId) {
            await handlePartnerRemoved(wabaId);
          }
          continue;
        }
        if (change.field === "message_template_status_update") {
          if (onTemplateStatus && value.message_template_id && value.event) {
            await onTemplateStatus({
              wabaId: entry.id,
              templateId: String(value.message_template_id),
              status: value.event,
              reason: value.reason ?? null,
            });
          }
          continue;
        }
        if (change.field === "history" && phoneNumberId) {
          await handleHistory(admin, phoneNumberId, value.history ?? []);
          continue;
        }
        if (change.field === "smb_message_echoes" && phoneNumberId) {
          await handleMessageEchoes(
            admin,
            phoneNumberId,
            value.message_echoes ?? [],
          );
          continue;
        }
        if (change.field === "smb_app_state_sync" && phoneNumberId) {
          await handleContactsSync(
            admin,
            phoneNumberId,
            value.state_sync ?? [],
          );
          continue;
        }
      } catch (e) {
        console.error(
          `[whatsapp] falha no aviso ${change.field}:`,
          (e as Error).message,
        );
        continue;
      }

      for (const st of value.statuses ?? []) {
        if (st.status === "failed") {
          const why = (st.errors ?? [])
            .map((e) => `${e.code} ${e.title}`)
            .join(" | ");
          console.error(
            `[whatsapp] entrega falhou (mensagem ${st.id}, para ${st.recipient_id}): ${why}`,
          );
        }
      }

      if (!value.messages?.length || !phoneNumberId) continue;
      try {
        await handleMessages(
          admin,
          phoneNumberId,
          value.messages,
          profileNames(value.contacts),
        );
      } catch (e) {
        console.error("[whatsapp] falha no webhook:", (e as Error).message);
      }
    }
  }
}

/** Nome do perfil de WhatsApp de cada remetente, quando a Meta manda junto com a mensagem. */
function profileNames(
  contacts: { wa_id?: string; profile?: { name?: string } }[] = [],
) {
  const names = new Map<string, string>();
  for (const c of contacts) {
    const phone = String(c.wa_id ?? "").replace(/\D/g, "");
    const name = c.profile?.name?.trim();
    if (phone && name) names.set(phone, name.slice(0, 120));
  }
  return names;
}

/**
 * Por que a IA não pode responder agora (null = pode). As mensagens são guardadas mesmo assim:
 * o painel é o histórico real da clínica, inclusive quando a assistente está pausada.
 */
type AiGate =
  | { ok: true; sender: Sender; subscriptionId: string }
  | { ok: false; sender: Sender | null };

async function aiGate(
  admin: Admin,
  clinic: InboundClinic,
  phoneNumberId: string,
): Promise<AiGate> {
  const { data: accessToken } = await admin
    .rpc("get_clinic_secret", {
      p_clinic_id: clinic.id,
      p_kind: "whatsapp_token",
    })
    .throwOnError();
  const sender: Sender | null = accessToken
    ? { phoneNumberId, accessToken }
    : null;
  if (!sender || !clinic.is_active) return { ok: false, sender };

  const { data: subs } = await admin
    .from("subscriptions")
    .select("*, plans(code, name, message_quota)")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false })
    .limit(10)
    .throwOnError();
  const sub = pickActiveSubscription(subs as SubscriptionRow[]);
  if (!sub) return { ok: false, sender }; // sem assinatura em dia, a assistente não responde

  if (sub.messages_used_this_period >= (sub.plans?.message_quota ?? 0)) {
    await notifyQuotaExceeded(admin, clinic, sender, sub.id).catch((e) =>
      console.error("[whatsapp] aviso de cota:", (e as Error).message),
    );
    return { ok: false, sender }; // cota do ciclo acabou: só volta a responder na renovação
  }
  return { ok: true, sender, subscriptionId: sub.id };
}

async function handleMessages(
  admin: Admin,
  phoneNumberId: string,
  messages: InboundMessage[],
  names: Map<string, string>,
) {
  const clinic = await clinicByPhoneNumberId(admin, phoneNumberId);
  if (!clinic) return; // número desconhecido

  const gate = await aiGate(admin, clinic, phoneNumberId);
  for (const msg of messages) {
    try {
      await processMessage(admin, clinic, gate, msg, names);
    } catch (e) {
      console.error("[whatsapp] falha na mensagem:", (e as Error).message);
    }
  }
}

/** Avisa a equipe uma vez por ciclo que a cota de mensagens acabou. */
async function notifyQuotaExceeded(
  admin: Admin,
  clinic: InboundClinic,
  sender: Sender,
  subscriptionId: string,
) {
  // Marca antes de avisar, e só se ninguém marcou: dois avisos chegando juntos mandam um só.
  const { data: claimed } = await admin
    .from("subscriptions")
    .update({ quota_alert_sent_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .is("quota_alert_sent_at", null)
    .select("id")
    .throwOnError();
  if (!claimed?.length) return;
  await alertStaff(admin, clinic, sender, [
    "Limite de mensagens do plano atingido",
    "A assistente parou de responder pelo WhatsApp até a renovação da assinatura",
  ]);
}

/** Aviso no WhatsApp da equipe, pelo template "aviso à equipe" (se houver número e template). */
async function alertStaff(
  admin: Admin,
  clinic: InboundClinic,
  sender: Sender,
  params: [string, string],
) {
  if (!clinic.staff_phone_number) return;
  const template = await templateFor(admin, clinic.id, "aviso_equipe");
  if (!template) return;
  await sendTemplateMessage(
    sender,
    clinic.staff_phone_number,
    template,
    params,
  );
}

/**
 * Põe a conversa na fila de atendimento humano e avisa a equipe por template. Vale tanto quando
 * a IA pede ([[ESCALAR]]) quanto quando ela falha: nos dois casos alguém precisa assumir.
 */
async function escalateToStaff(
  admin: Admin,
  clinic: InboundClinic,
  sender: Sender,
  conversationId: number,
  from: string,
  patientMessage: string,
) {
  try {
    await admin
      .from("conversations")
      .update({
        attendance_state: "pendente",
        needs_human_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .neq("attendance_state", "equipe")
      .throwOnError();
  } catch (e) {
    console.error("[whatsapp] marcar pendente:", (e as Error).message);
  }

  try {
    await alertStaff(admin, clinic, sender, [
      `+${from}`,
      patientMessage.slice(0, 200),
    ]);
  } catch (e) {
    console.error("[whatsapp] aviso à equipe:", (e as Error).message);
  }
}

async function processMessage(
  admin: Admin,
  clinic: InboundClinic,
  gate: AiGate,
  msg: InboundMessage,
  names: Map<string, string>,
) {
  const from = String(msg.from ?? "").replace(/\D/g, "");
  if (!from) return;

  const body = messageText(msg);
  if (!body) return;
  // Botões de um template também são texto para a IA.
  const isText = ["text", "button", "interactive"].includes(msg.type ?? "");

  const conversation = await findOrCreateConversation(
    admin,
    clinic,
    from,
    gate.ok ? "ia" : "equipe",
  );
  await saveProfileName(admin, conversation.contact_id, names.get(from));

  // O id da Meta é único: um reenvio da mesma mensagem para aqui.
  const { error: insertError } = await admin.from("messages").insert({
    clinic_id: clinic.id,
    conversation_id: conversation.id,
    contact_phone: from,
    role: "user",
    content: body.slice(0, 2000),
    wa_message_id: msg.id ?? null,
    created_at: whatsappTime(msg.timestamp),
  });
  if (insertError?.code === "23505") return;
  if (insertError) throw new Error(insertError.message);
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .throwOnError();

  // Assistente pausada, sem assinatura ou sem cota: a mensagem fica no painel para a equipe.
  if (!gate.ok) return;
  // Alguém da equipe assumiu a conversa: a IA fica quieta até devolverem para ela.
  if (conversation.attendance_state === "equipe") return;

  const { sender, subscriptionId } = gate;
  if (!isText) {
    await sendText(
      sender,
      from,
      "Por enquanto consigo responder apenas mensagens de texto. Pode escrever sua dúvida por aqui? 😊",
    );
    return;
  }

  let reply;
  try {
    const [{ integration, ...context }, history, sentImageIds] =
      await Promise.all([
        loadAssistantContext(admin, clinic.id),
        loadHistory(admin, conversation.id),
        loadSentImageIds(admin, conversation.id),
      ]);
    reply = await generateReply({
      context,
      history,
      sentImageIds,
      agenda: integration?.enabled
        ? {
            kind: "live",
            integration,
            contactPhone: from,
            conversationId: conversation.id,
          }
        : null,
    });
  } catch (e) {
    console.error("[whatsapp] a IA falhou:", (e as Error).message);
    await sendText(
      sender,
      from,
      "Desculpe, tive um problema para responder agora. Nossa equipe vai te retornar em breve.",
    );
    // Prometemos que a equipe vai retornar: a conversa precisa cair na fila e alguém ser avisado.
    await escalateToStaff(admin, clinic, sender, conversation.id, from, body);
    return;
  }

  await sendText(sender, from, reply.text);

  let sentImageId: string | null = null;
  for (const image of reply.images) {
    try {
      await sendImage(sender, from, publicImageUrl(image.storage_path));
      sentImageId = image.id;
    } catch (e) {
      console.error("[whatsapp] envio da foto:", (e as Error).message);
    }
  }

  await admin
    .from("messages")
    .insert({
      clinic_id: clinic.id,
      conversation_id: conversation.id,
      contact_phone: from,
      role: "model",
      content: reply.text,
      sent_image_id: sentImageId,
    })
    .throwOnError();
  // A cota conta as respostas da IA, não as mensagens recebidas.
  const { error: countError } = await admin.rpc("count_ai_message", {
    p_subscription_id: subscriptionId,
  });
  if (countError) {
    console.error("[whatsapp] contar na cota:", countError.message);
  }

  if (reply.needsHuman) {
    await escalateToStaff(admin, clinic, sender, conversation.id, from, body);
  }
}

/** Guarda o nome do perfil de WhatsApp no contato (só quando mudou). */
async function saveProfileName(
  admin: Admin,
  contactId: string | null,
  name: string | undefined,
) {
  if (!contactId || !name) return;
  const { error } = await admin
    .from("contacts")
    .update({ whatsapp_name: name })
    .eq("id", contactId)
    .neq("whatsapp_name", name);
  if (error) console.error("[whatsapp] nome do contato:", error.message);
}

/** As últimas mensagens da conversa, da mais antiga para a mais nova. */
async function loadHistory(
  admin: Admin,
  conversationId: number,
): Promise<ChatTurn[]> {
  const { data } = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(HISTORY_SIZE)
    .throwOnError();
  // O que a equipe escreveu à mão também é a clínica falando.
  return data.reverse().map((m) => ({
    role: m.role === "user" ? "user" : "model",
    text: m.content,
  }));
}

async function loadSentImageIds(admin: Admin, conversationId: number) {
  const { data } = await admin
    .from("messages")
    .select("sent_image_id")
    .eq("conversation_id", conversationId)
    .not("sent_image_id", "is", null)
    .throwOnError();
  return data.map((m) => m.sent_image_id!);
}
