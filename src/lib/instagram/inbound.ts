import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateReply, loadAssistantContext } from "@/lib/ai/engine";
import { INSTAGRAM_COMMENT_PREFIX } from "@/lib/ai/prompt";
import { publicImageUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Sender } from "@/lib/whatsapp/client";
import { findOrCreateConversation } from "@/lib/whatsapp/conversations";
import {
  countAiMessage,
  escalateToStaff,
  loadHistory,
  loadPreviousSummaries,
  loadSentImageIds,
  markOptedOut,
  OPT_OUT,
  OPT_OUT_REPLY,
  subscriptionWithQuota,
} from "@/lib/whatsapp/inbound";
import { getClinicSender } from "@/lib/whatsapp/sender";

import { accountByIgUserId, getInstagramSender } from "./account";
import {
  fetchProfile,
  sendInstagramImage,
  sendInstagramText,
  sendPrivateReply,
  type InstagramSender,
} from "./api";

type Admin = SupabaseClient<Database>;

// O eco de uma mensagem da própria IA pode chegar antes de ela ser gravada: espera um pouco
// antes de decidir que foi alguém da equipe respondendo pelo app.
const ECHO_GRACE_MS = 5_000;

type Attachment = { type?: string; payload?: { url?: string } };

export type InstagramMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    app_id?: number | string;
    attachments?: Attachment[];
    quick_reply?: { payload?: string };
    reply_to?: { story?: { url?: string; id?: string } };
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

export type InstagramComment = {
  id?: string;
  text?: string;
  parent_id?: string;
  from?: { id?: string; username?: string; self_ig_scoped_id?: string };
  media?: { id?: string; media_product_type?: string };
};

export type InstagramEvent = {
  object?: string;
  entry?: {
    id?: string; // a conta profissional do Instagram que recebeu
    time?: number;
    messaging?: InstagramMessaging[];
    changes?: { field?: string; value?: InstagramComment }[];
  }[];
};

type Account = NonNullable<Awaited<ReturnType<typeof accountByIgUserId>>>;

type Clinic = {
  id: string;
  is_active: boolean;
  conversation_timeout_hours: number | null;
};

/** Quem atende e por onde. `ok` = a IA pode responder agora. */
type Gate = {
  ok: boolean;
  sender: InstagramSender | null;
  /** O WhatsApp da clínica, só para os avisos à equipe. */
  alertSender: Sender | null;
  subscriptionId: string | null;
};

const LABELS: Record<string, string> = {
  image: "📷 Foto",
  video: "🎬 Vídeo",
  audio: "🎤 Áudio",
  file: "📄 Arquivo",
  share: "🔗 Compartilhou uma publicação",
  ig_reel: "🎬 Compartilhou um reel",
  reel: "🎬 Compartilhou um reel",
  story_mention: "📣 Marcou a clínica num story",
  ig_post: "🔗 Compartilhou uma publicação",
};

/** O texto da mensagem para o painel e para a IA; anexos viram um rótulo. */
export function instagramText(msg: NonNullable<InstagramMessaging["message"]>) {
  const text = msg.text?.trim() ?? "";
  const labels = (msg.attachments ?? []).map(
    (a) => LABELS[a.type ?? ""] ?? "Anexo",
  );
  const story = msg.reply_to?.story ? "↩️ Respondeu a um story" : "";
  return [story, ...labels, text].filter(Boolean).join(": ");
}

const eventTime = (ms: number | undefined) =>
  Number(ms) > 0 ? new Date(Number(ms)).toISOString() : undefined;

/**
 * Processa um aviso do webhook do Instagram: mensagens do Direct, ecos (o que a clínica mandou,
 * pela IA ou pelo app) e comentários nos posts. Roda depois de responder 200 à Meta.
 */
export async function handleInstagramEvent(body: InstagramEvent) {
  if (body?.object !== "instagram") return;
  const admin = createAdminClient();

  for (const entry of body.entry ?? []) {
    const igUserId = String(entry.id ?? "");
    if (!igUserId) continue;
    let account: Account | null;
    try {
      account = await accountByIgUserId(admin, igUserId);
    } catch (e) {
      console.error("[instagram] conta:", (e as Error).message);
      continue;
    }
    if (!account || account.status !== "ativo") continue; // conta desconhecida ou desligada

    const comments = (entry.changes ?? []).filter(
      (c) => c.field === "comments" && c.value,
    );
    const messaging = entry.messaging ?? [];
    if (!comments.length && !messaging.length) continue;

    let clinic: Clinic;
    let gate: Gate;
    try {
      const { data } = await admin
        .from("clinics")
        .select("id, is_active, conversation_timeout_hours")
        .eq("id", account.clinic_id)
        .single()
        .throwOnError();
      clinic = data;
      gate = await aiGate(admin, clinic);
    } catch (e) {
      console.error("[instagram] clínica:", (e as Error).message);
      continue;
    }

    for (const item of messaging) {
      try {
        if (item.message?.is_echo) {
          await handleEcho(admin, clinic, account, item);
        } else {
          await handleMessage(admin, clinic, account, gate, item);
        }
      } catch (e) {
        console.error("[instagram] falha na mensagem:", (e as Error).message);
      }
    }
    for (const change of comments) {
      try {
        await handleComment(admin, clinic, account, gate, change.value!);
      } catch (e) {
        console.error("[instagram] falha no comentário:", (e as Error).message);
      }
    }
  }
}

async function aiGate(admin: Admin, clinic: Clinic): Promise<Gate> {
  const [sender, alertSender] = await Promise.all([
    getInstagramSender(admin, clinic.id),
    getClinicSender(admin, clinic.id).catch(() => null),
  ]);
  if (!sender || !clinic.is_active) {
    return { ok: false, sender, alertSender, subscriptionId: null };
  }
  const subscriptionId = await subscriptionWithQuota(
    admin,
    clinic.id,
    alertSender,
  );
  return { ok: Boolean(subscriptionId), sender, alertSender, subscriptionId };
}

/** Guarda o @ da pessoa no contato, na primeira vez (o Instagram não manda junto com a mensagem). */
async function saveProfile(
  admin: Admin,
  sender: InstagramSender | null,
  contactId: string | null,
  igsid: string,
  username?: string,
) {
  if (!contactId) return;
  try {
    const { data: contact } = await admin
      .from("contacts")
      .select("instagram_username")
      .eq("id", contactId)
      .single()
      .throwOnError();
    if (contact.instagram_username && !username) return;
    const name =
      username || (sender ? (await fetchProfile(sender, igsid)).username : "");
    if (!name || name === contact.instagram_username) return;
    await admin
      .from("contacts")
      .update({ instagram_username: name.slice(0, 60) })
      .eq("id", contactId)
      .throwOnError();
  } catch (e) {
    console.error("[instagram] perfil do contato:", (e as Error).message);
  }
}

async function handleMessage(
  admin: Admin,
  clinic: Clinic,
  account: Account,
  gate: Gate,
  item: InstagramMessaging,
) {
  const from = String(item.sender?.id ?? "");
  if (!from || from === account.ig_user_id) return;
  const msg = item.message;
  // Botões (respostas rápidas e menus) também são texto para a IA.
  const body = msg ? instagramText(msg) : item.postback?.title?.trim() || "";
  const mid = msg?.mid ?? item.postback?.mid ?? null;
  if (!body || msg?.is_deleted) return;
  const isText = Boolean(msg?.text?.trim() || item.postback?.title);

  const conversation = await findOrCreateConversation(
    admin,
    clinic,
    from,
    gate.ok ? "ia" : "equipe",
    "instagram",
  );
  const { error: insertError } = await admin.from("messages").insert({
    clinic_id: clinic.id,
    conversation_id: conversation.id,
    contact_phone: from,
    role: "user",
    content: (msg?.is_unsupported ? "Mensagem não suportada" : body).slice(
      0,
      2000,
    ),
    wa_message_id: mid,
    created_at: eventTime(item.timestamp),
  });
  if (insertError?.code === "23505") return; // reenvio da mesma mensagem
  if (insertError) throw new Error(insertError.message);
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .throwOnError();
  await saveProfile(admin, gate.sender, conversation.contact_id, from);

  if (OPT_OUT.test(body.trim()) && conversation.contact_id) {
    if ((await markOptedOut(admin, conversation.contact_id)) && gate.sender) {
      await reply(admin, clinic, gate.sender, conversation.id, from, {
        text: OPT_OUT_REPLY,
      });
    }
    return;
  }

  // Assistente pausada, sem assinatura ou sem cota: a mensagem fica no painel para a equipe.
  if (!gate.ok || !gate.sender || !gate.subscriptionId) return;
  // Alguém da equipe assumiu a conversa: a IA fica quieta até devolverem para ela.
  if (conversation.attendance_state === "equipe") return;
  // Marcação num story: a equipe vê no painel, a IA não precisa agradecer sozinha.
  if (!isText) {
    if (msg?.attachments?.some((a) => a.type === "story_mention")) return;
    await reply(admin, clinic, gate.sender, conversation.id, from, {
      text: "Por enquanto consigo responder apenas mensagens de texto. Pode escrever sua dúvida por aqui? 😊",
    });
    return;
  }

  await answerWithAi(admin, clinic, gate, conversation, from, body, null);
}

/**
 * Comentário num post: com a opção ligada, a IA responde no privado (uma vez por comentário).
 * O comentário entra como mensagem da conversa da pessoa no Instagram.
 */
async function handleComment(
  admin: Admin,
  clinic: Clinic,
  account: Account,
  gate: Gate,
  comment: InstagramComment,
) {
  const from = String(comment.from?.id ?? "");
  const text = comment.text?.trim() ?? "";
  if (!account.reply_comments || !comment.id || !from || !text) return;
  if (from === account.ig_user_id) return; // a própria clínica respondendo no post
  if (!gate.ok || !gate.sender || !gate.subscriptionId) return;

  const conversation = await findOrCreateConversation(
    admin,
    clinic,
    from,
    "ia",
    "instagram",
  );
  if (conversation.attendance_state === "equipe") return;
  const body = `${INSTAGRAM_COMMENT_PREFIX} ${text}`;
  const { error: insertError } = await admin.from("messages").insert({
    clinic_id: clinic.id,
    conversation_id: conversation.id,
    contact_phone: from,
    role: "user",
    content: body.slice(0, 2000),
    wa_message_id: `comment:${comment.id}`,
  });
  if (insertError?.code === "23505") return; // o mesmo comentário de novo
  if (insertError) throw new Error(insertError.message);
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .throwOnError();
  await saveProfile(
    admin,
    gate.sender,
    conversation.contact_id,
    from,
    comment.from?.username,
  );

  await answerWithAi(admin, clinic, gate, conversation, from, body, comment.id);
}

/** Gera a resposta da IA e envia: pelo Direct, ou no privado do comentário (`commentId`). */
async function answerWithAi(
  admin: Admin,
  clinic: Clinic,
  gate: Gate,
  conversation: { id: number; contact_id: string | null },
  from: string,
  body: string,
  commentId: string | null,
) {
  const sender = gate.sender!;
  const subscriptionId = gate.subscriptionId!;
  const who = await contactLabel(admin, conversation.contact_id);

  let generated;
  try {
    const [
      { integration, ...context },
      history,
      sentImageIds,
      previousSummaries,
      contact,
    ] = await Promise.all([
      loadAssistantContext(admin, clinic.id),
      loadHistory(admin, conversation.id),
      loadSentImageIds(admin, conversation.id),
      loadPreviousSummaries(admin, conversation),
      conversation.contact_id
        ? admin
            .from("contacts")
            .select("phone")
            .eq("id", conversation.contact_id)
            .single()
            .throwOnError()
            .then((r) => r.data)
        : Promise.resolve(null),
    ]);
    const phone = contact?.phone ?? null;
    generated = await generateReply({
      context,
      history,
      sentImageIds,
      previousSummaries,
      channel: "instagram",
      // A retomada combinada sai por mensagem pronta do WhatsApp: só com o número da pessoa.
      followUp:
        conversation.contact_id && phone
          ? {
              kind: "live",
              clinicId: clinic.id,
              contactId: conversation.contact_id,
              conversationId: conversation.id,
            }
          : null,
      agenda: integration?.enabled
        ? {
            kind: "live",
            integration,
            contactPhone: phone,
            contactId: conversation.contact_id,
            conversationId: conversation.id,
          }
        : null,
    });
  } catch (e) {
    console.error("[instagram] a IA falhou:", (e as Error).message);
    if (commentId) return; // num comentário, melhor não responder do que pedir desculpas
    await reply(admin, clinic, sender, conversation.id, from, {
      text: "Desculpe, tive um problema para responder agora. Nossa equipe vai te retornar em breve.",
    });
    await escalateToStaff(
      admin,
      clinic.id,
      gate.alertSender,
      conversation.id,
      who,
      body,
    );
    return;
  }

  if (commentId && generated.ignore) return;

  await reply(admin, clinic, sender, conversation.id, from, {
    text: generated.text,
    imageId: commentId ? null : (generated.images[0]?.id ?? null),
    imagePath: commentId ? null : (generated.images[0]?.storage_path ?? null),
    commentId,
  });
  await countAiMessage(admin, subscriptionId);

  if (generated.needsHuman) {
    await escalateToStaff(
      admin,
      clinic.id,
      gate.alertSender,
      conversation.id,
      who,
      body,
    );
  }
}

/** Envia pelo Instagram e grava no painel como mensagem da assistente. */
async function reply(
  admin: Admin,
  clinic: Clinic,
  sender: InstagramSender,
  conversationId: number,
  to: string,
  message: {
    text: string;
    imageId?: string | null;
    imagePath?: string | null;
    commentId?: string | null;
  },
) {
  let lastId: string | null;
  if (message.commentId) {
    lastId = await sendPrivateReply(sender, message.commentId, message.text);
  } else {
    lastId = (await sendInstagramText(sender, to, message.text)).at(-1) ?? null;
  }

  let sentImageId: string | null = null;
  if (message.imageId && message.imagePath) {
    try {
      lastId =
        (await sendInstagramImage(
          sender,
          to,
          publicImageUrl(message.imagePath),
        )) ?? lastId;
      sentImageId = message.imageId;
    } catch (e) {
      console.error("[instagram] envio da foto:", (e as Error).message);
    }
  }

  await admin
    .from("messages")
    .insert({
      clinic_id: clinic.id,
      conversation_id: conversationId,
      contact_phone: to,
      role: "model",
      content: message.text,
      sent_image_id: sentImageId,
      wa_message_id: lastId,
    })
    .throwOnError();
}

/** Como a pessoa aparece no aviso à equipe. */
async function contactLabel(admin: Admin, contactId: string | null) {
  if (!contactId) return "Instagram";
  const { data } = await admin
    .from("contacts")
    .select("name, instagram_username")
    .eq("id", contactId)
    .maybeSingle();
  if (data?.name) return `${data.name} (Instagram)`;
  return data?.instagram_username
    ? `@${data.instagram_username} no Instagram`
    : "Instagram";
}

/**
 * O que a clínica mandou pelo Direct. As mensagens da própria IA voltam como eco e são
 * ignoradas; as que alguém da equipe mandou pelo app do Instagram entram no painel e pausam a
 * IA naquela conversa, como no WhatsApp Business do celular.
 */
async function handleEcho(
  admin: Admin,
  clinic: Clinic,
  account: Account,
  item: InstagramMessaging,
) {
  const msg = item.message!;
  const to = String(item.recipient?.id ?? "");
  if (!to || to === account.ig_user_id || !msg.mid || msg.is_deleted) return;
  // Enviada por um app (a LumenzIA ou outra ferramenta), não por uma pessoa no Instagram.
  if (msg.app_id) return;

  await new Promise((r) => setTimeout(r, ECHO_GRACE_MS));
  const { data: known } = await admin
    .from("messages")
    .select("id")
    .eq("wa_message_id", msg.mid)
    .maybeSingle()
    .throwOnError();
  if (known) return;

  const content = instagramText(msg).slice(0, 4000) || "Mensagem";
  const conversation = await findOrCreateConversation(
    admin,
    clinic,
    to,
    "equipe",
    "instagram",
  );
  // A IA mandou em partes (ou a foto): o eco de cada parte bate com o começo do que foi gravado.
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("messages")
    .select("content")
    .eq("conversation_id", conversation.id)
    .in("role", ["model", "staff"])
    .gte("created_at", since)
    .throwOnError();
  if (
    recent.some(
      (m) => msg.text && m.content.includes(msg.text.trim().slice(0, 200)),
    ) ||
    (!msg.text && recent.length)
  ) {
    return;
  }

  const { error } = await admin.from("messages").insert({
    clinic_id: clinic.id,
    conversation_id: conversation.id,
    contact_phone: to,
    role: "staff",
    origin: "celular",
    content,
    wa_message_id: msg.mid,
    created_at: eventTime(item.timestamp),
  });
  if (error?.code === "23505") return;
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
}
