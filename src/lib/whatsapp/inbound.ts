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

import { sendImage, sendTemplate, sendText, type Sender } from "./client";
import { handlePartnerRemoved } from "./embedded-signup";

/** Tempo sem mensagens que encerra uma conversa, quando a clínica não escolheu outro. */
export const DEFAULT_CONVERSATION_TIMEOUT_HOURS = 6;
const HISTORY_SIZE = 20;

type Admin = SupabaseClient<Database>;

type Clinic = {
  id: string;
  is_active: boolean;
  conversation_timeout_hours: number | null;
  staff_phone_number: string | null;
  staff_alert_template_name: string | null;
  template_language: string;
};

type InboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

export type WhatsappEvent = {
  object?: string;
  entry?: {
    id?: string; // a conta do WhatsApp Business (WABA)
    changes?: {
      field?: string;
      value?: {
        event?: string; // field = "account_update"
        waba_info?: { waba_id?: string };
        metadata?: { phone_number_id?: string };
        messages?: InboundMessage[];
        statuses?: {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string }[];
        }[];
      };
    }[];
  }[];
};

/**
 * Processa um aviso do webhook do WhatsApp: mensagens recebidas e falhas de entrega. Roda depois
 * de responder 200 à Meta, então cada falha é só registrada no log.
 */
export async function handleWhatsappEvent(body: WhatsappEvent) {
  if (body?.object !== "whatsapp_business_account") return;
  const admin = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      if (
        change.field === "account_update" &&
        value.event === "PARTNER_REMOVED"
      ) {
        const wabaId = value.waba_info?.waba_id ?? entry.id;
        if (wabaId) {
          await handlePartnerRemoved(wabaId).catch((e) =>
            console.error(
              "[whatsapp] parceiro removido:",
              (e as Error).message,
            ),
          );
        }
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

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!value.messages?.length || !phoneNumberId) continue;
      try {
        await handleMessages(admin, phoneNumberId, value.messages);
      } catch (e) {
        console.error("[whatsapp] falha no webhook:", (e as Error).message);
      }
    }
  }
}

async function handleMessages(
  admin: Admin,
  phoneNumberId: string,
  messages: InboundMessage[],
) {
  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "id, is_active, conversation_timeout_hours, staff_phone_number, staff_alert_template_name, template_language",
    )
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle()
    .throwOnError();
  if (!clinic?.is_active) return; // número desconhecido ou assistente pausada

  const { data: accessToken } = await admin
    .rpc("get_clinic_secret", {
      p_clinic_id: clinic.id,
      p_kind: "whatsapp_token",
    })
    .throwOnError();
  if (!accessToken) return;
  const sender: Sender = { phoneNumberId, accessToken };

  const { data: subs } = await admin
    .from("subscriptions")
    .select("*, plans(code, name, message_quota)")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false })
    .limit(10)
    .throwOnError();
  const sub = pickActiveSubscription(subs as SubscriptionRow[]);
  if (!sub) return; // sem assinatura em dia, a assistente não responde

  if (sub.messages_used_this_period >= (sub.plans?.message_quota ?? 0)) {
    await notifyQuotaExceeded(admin, clinic, sender, sub.id).catch((e) =>
      console.error("[whatsapp] aviso de cota:", (e as Error).message),
    );
    return; // cota do ciclo acabou: só volta a responder na renovação
  }

  for (const msg of messages) {
    try {
      await processMessage(admin, clinic, sender, sub.id, msg);
    } catch (e) {
      console.error("[whatsapp] falha na mensagem:", (e as Error).message);
    }
  }
}

/** Avisa a equipe uma vez por ciclo que a cota de mensagens acabou. */
async function notifyQuotaExceeded(
  admin: Admin,
  clinic: Clinic,
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
  if (clinic.staff_phone_number && clinic.staff_alert_template_name) {
    await sendTemplate(
      sender,
      clinic.staff_phone_number,
      clinic.staff_alert_template_name,
      clinic.template_language,
      [
        "Limite de mensagens do plano atingido",
        "A assistente parou de responder pelo WhatsApp até a renovação da assinatura.",
      ],
    );
  }
}

/** A conversa aberta do contato, se ainda estiver dentro do tempo limite; senão, uma nova. */
async function findOrCreateConversation(
  admin: Admin,
  clinic: Clinic,
  phone: string,
) {
  const hours =
    clinic.conversation_timeout_hours ?? DEFAULT_CONVERSATION_TIMEOUT_HOURS;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data: open } = await admin
    .from("conversations")
    .select("id, attendance_state")
    .eq("clinic_id", clinic.id)
    .eq("contact_phone", phone)
    .eq("status", "aberta")
    .gt("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();
  if (open) return open;

  const { data: created } = await admin
    .from("conversations")
    .insert({ clinic_id: clinic.id, contact_phone: phone })
    .select("id, attendance_state")
    .single()
    .throwOnError();
  return created;
}

/**
 * Põe a conversa na fila de atendimento humano e avisa a equipe por template. Vale tanto quando
 * a IA pede ([[ESCALAR]]) quanto quando ela falha: nos dois casos alguém precisa assumir.
 */
async function escalateToStaff(
  admin: Admin,
  clinic: Clinic,
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

  if (clinic.staff_phone_number && clinic.staff_alert_template_name) {
    try {
      await sendTemplate(
        sender,
        clinic.staff_phone_number,
        clinic.staff_alert_template_name,
        clinic.template_language,
        [`+${from}`, patientMessage.slice(0, 200)],
      );
    } catch (e) {
      console.error("[whatsapp] aviso à equipe:", (e as Error).message);
    }
  }
}

async function processMessage(
  admin: Admin,
  clinic: Clinic,
  sender: Sender,
  subscriptionId: string,
  msg: InboundMessage,
) {
  const from = String(msg.from ?? "").replace(/\D/g, "");
  if (!from) return;

  const body = msg.type === "text" ? msg.text?.body?.trim() : undefined;
  if (!body) {
    await sendText(
      sender,
      from,
      "Por enquanto consigo responder apenas mensagens de texto. Pode escrever sua dúvida por aqui? 😊",
    );
    return;
  }

  const conversation = await findOrCreateConversation(admin, clinic, from);

  // Guarda a mensagem com a hora em que o celular enviou (a Meta reentrega mensagens atrasadas).
  // O id da Meta é único: um reenvio da mesma mensagem para aqui.
  const sentAt =
    Number(msg.timestamp) > 0
      ? new Date(Number(msg.timestamp) * 1000).toISOString()
      : undefined;
  const { error: insertError } = await admin.from("messages").insert({
    clinic_id: clinic.id,
    conversation_id: conversation.id,
    contact_phone: from,
    role: "user",
    content: body.slice(0, 2000),
    wa_message_id: msg.id ?? null,
    created_at: sentAt,
  });
  if (insertError?.code === "23505") return;
  if (insertError) throw new Error(insertError.message);
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .throwOnError();

  // Alguém da equipe assumiu a conversa: a IA fica quieta até devolverem para ela.
  if (conversation.attendance_state === "equipe") return;

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
        ? { kind: "live", integration, contactPhone: from }
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
