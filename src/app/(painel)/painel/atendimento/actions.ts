"use server";

import { z } from "zod";

import { normalizePhone } from "@/lib/format";
import { closeConversation } from "@/lib/jobs/close-conversation";
import { getActionContext } from "@/lib/painel/context";
import { publicImageUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendImage, sendText } from "@/lib/whatsapp/client";
import { findOrCreateConversation } from "@/lib/whatsapp/conversations";
import { getClinicSender } from "@/lib/whatsapp/sender";
import { placeholderCount } from "@/lib/whatsapp/template-pack";
import { sendTemplateMessage } from "@/lib/whatsapp/templates";

export type AttendanceResult = { ok: true } | { ok: false; error: string };

/** Fora desta janela depois da última mensagem do paciente, o WhatsApp só aceita templates. */
const WHATSAPP_WINDOW_MS = 24 * 3600_000;

const idSchema = z.number().int().positive();
const replySchema = z
  .object({
    conversationId: idSchema,
    message: z.string().trim().max(4000),
    imageId: z.uuid().nullable(),
  })
  .refine((v) => v.message || v.imageId);

const fail = (error: string): AttendanceResult => ({ ok: false, error });
const gone = () => fail("Esta conversa já foi encerrada.");

/** Muda quem responde a conversa (o RLS confere de novo que ela é da clínica de quem pediu). */
async function setAttendance(
  conversationId: unknown,
  state: "equipe" | "ia",
): Promise<AttendanceResult> {
  const id = idSchema.safeParse(conversationId);
  if (!id.success) return fail("Conversa inválida.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { data, error } = await ctx.supabase
    .from("conversations")
    .update(
      state === "ia"
        ? { attendance_state: "ia", needs_human_at: null }
        : { attendance_state: "equipe" },
    )
    .eq("id", id.data)
    .eq("clinic_id", ctx.clinic.id)
    .eq("status", "aberta")
    .select("id");
  if (error) {
    console.error("[atendimento] mudar quem responde:", error.message);
    return fail("Não foi possível agora. Tente de novo.");
  }
  return data.length ? { ok: true } : gone();
}

/** A equipe assume: a IA para de responder esta conversa até ser devolvida. */
export async function takeConversation(conversationId: unknown) {
  return setAttendance(conversationId, "equipe");
}

/** Devolve para a IA, que volta a responder sozinha a próxima mensagem do paciente. */
export async function returnToAi(conversationId: unknown) {
  return setAttendance(conversationId, "ia");
}

/**
 * Resposta de alguém da equipe pelo número de WhatsApp da clínica. Assume a conversa (a IA fica
 * quieta) e grava quem enviou.
 */
export async function sendStaffReply(
  input: unknown,
): Promise<AttendanceResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success)
    return fail(
      "Escreva uma mensagem de até 4000 caracteres ou escolha uma foto.",
    );
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);
  const { conversationId, message, imageId } = parsed.data;

  // Lido como a pessoa logada: se a conversa não é da clínica dela, não aparece.
  const { data: conversation } = await ctx.supabase
    .from("conversations")
    .select("id, clinic_id, contact_phone, status")
    .eq("id", conversationId)
    .eq("clinic_id", ctx.clinic.id)
    .maybeSingle();
  if (!conversation) return fail("Conversa não encontrada.");
  if (conversation.status !== "aberta") return gone();

  const [{ data: lastPatient }, { data: image }] = await Promise.all([
    ctx.supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    imageId
      ? ctx.supabase
          .from("images")
          .select("id, storage_path")
          .eq("id", imageId)
          .eq("clinic_id", ctx.clinic.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (imageId && !image) return fail("Foto não encontrada.");
  if (
    !lastPatient ||
    Date.now() - Date.parse(lastPatient.created_at) > WHATSAPP_WINDOW_MS
  ) {
    return fail(
      "Já se passaram 24 horas desde a última mensagem do paciente. O WhatsApp só deixa a clínica escrever de novo quando ele mandar uma mensagem.",
    );
  }

  const admin = createAdminClient();
  let sender;
  try {
    sender = await getClinicSender(admin, ctx.clinic.id);
  } catch (e) {
    console.error("[atendimento] token do WhatsApp:", (e as Error).message);
  }
  if (!sender) {
    return fail(
      "O WhatsApp da clínica ainda não está conectado, então não dá para enviar daqui.",
    );
  }

  try {
    if (message) await sendText(sender, conversation.contact_phone, message);
    if (image)
      await sendImage(
        sender,
        conversation.contact_phone,
        publicImageUrl(image.storage_path),
      );
  } catch (e) {
    console.error("[atendimento] envio:", (e as Error).message);
    return fail("O WhatsApp recusou a mensagem. Tente de novo em instantes.");
  }

  // Já foi para o paciente: daqui para frente, falhas só vão para o log.
  const now = new Date().toISOString();
  const [saved, updated] = await Promise.all([
    admin.from("messages").insert({
      clinic_id: ctx.clinic.id,
      conversation_id: conversationId,
      contact_phone: conversation.contact_phone,
      role: "staff",
      origin: "painel",
      content: message || "📷 Foto enviada",
      sent_by: ctx.user.id,
      sent_image_id: image?.id ?? null,
    }),
    admin
      .from("conversations")
      .update({ attendance_state: "equipe", last_message_at: now })
      .eq("id", conversationId),
  ]);
  for (const r of [saved, updated]) {
    if (r.error)
      console.error("[atendimento] gravar resposta:", r.error.message);
  }
  return { ok: true };
}

/** Encerra agora, sem esperar o tempo limite, e classifica motivo e desfecho. */
export async function endConversation(
  conversationId: unknown,
): Promise<AttendanceResult> {
  const id = idSchema.safeParse(conversationId);
  if (!id.success) return fail("Conversa inválida.");
  const ctx = await getActionContext();
  if ("error" in ctx) return fail(ctx.error);

  const { data: conversation } = await ctx.supabase
    .from("conversations")
    .select("id, clinic_id, status")
    .eq("id", id.data)
    .eq("clinic_id", ctx.clinic.id)
    .maybeSingle();
  if (!conversation) return fail("Conversa não encontrada.");
  if (conversation.status !== "aberta") return gone();

  try {
    const closed = await closeConversation(createAdminClient(), conversation, {
      fallback: true,
    });
    return closed ? { ok: true } : gone();
  } catch (e) {
    console.error("[atendimento] encerrar:", (e as Error).message);
    return fail("Não foi possível encerrar agora. Tente de novo.");
  }
}

const templateSendSchema = z
  .object({
    conversationId: idSchema.nullable(),
    phone: z.string().trim().max(30).nullable(),
    templateId: z.uuid(),
    params: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .refine((v) => v.conversationId || v.phone);

export type TemplateSendResult =
  { ok: true; conversationId: number } | { ok: false; error: string };

/**
 * Envia uma mensagem pronta (template aprovado), o único jeito de escrever depois das 24 horas do
 * WhatsApp: numa conversa em andamento, para retomar um contato, ou para um número novo. A equipe
 * assume a conversa, que aparece na caixa de entrada esperando a resposta do paciente.
 */
export async function sendTemplateToContact(
  input: unknown,
): Promise<TemplateSendResult> {
  const parsed = templateSendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Preencha todos os campos da mensagem." };
  }
  const v = parsed.data;
  const ctx = await getActionContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const admin = createAdminClient();

  let phone = v.phone ? normalizePhone(v.phone) : null;
  if (v.conversationId) {
    const { data: conversation } = await ctx.supabase
      .from("conversations")
      .select("contact_phone")
      .eq("id", v.conversationId)
      .eq("clinic_id", ctx.clinic.id)
      .maybeSingle();
    if (!conversation) return { ok: false, error: "Conversa não encontrada." };
    phone = conversation.contact_phone;
  }
  if (!phone) {
    return {
      ok: false,
      error:
        "Informe o WhatsApp com DDD (e o código do país, se não for do Brasil).",
    };
  }

  const [{ data: template }, { data: contact }] = await Promise.all([
    ctx.supabase
      .from("message_templates")
      .select("name, language, body, status, category")
      .eq("id", v.templateId)
      .eq("clinic_id", ctx.clinic.id)
      .maybeSingle(),
    ctx.supabase
      .from("contacts")
      .select("opted_out_at")
      .eq("clinic_id", ctx.clinic.id)
      .eq("phone", phone)
      .maybeSingle(),
  ]);
  if (!template) return { ok: false, error: "Mensagem pronta não encontrada." };
  if (template.status !== "APPROVED") {
    return {
      ok: false,
      error: "Esta mensagem ainda não foi aprovada pela Meta.",
    };
  }
  if (contact?.opted_out_at && template.category === "MARKETING") {
    return {
      ok: false,
      error: "Este contato pediu para não receber mais mensagens da clínica.",
    };
  }
  if (v.params.length !== placeholderCount(template.body)) {
    return { ok: false, error: "Preencha todos os campos da mensagem." };
  }

  let sender;
  try {
    sender = await getClinicSender(admin, ctx.clinic.id);
  } catch (e) {
    console.error("[atendimento] token do WhatsApp:", (e as Error).message);
  }
  if (!sender) {
    return {
      ok: false,
      error:
        "O WhatsApp da clínica ainda não está conectado, então não dá para enviar daqui.",
    };
  }

  let content: string;
  try {
    content = await sendTemplateMessage(sender, phone, template, v.params);
  } catch (e) {
    console.error("[atendimento] template:", (e as Error).message);
    return {
      ok: false,
      error: "O WhatsApp recusou a mensagem. Confira o número e tente de novo.",
    };
  }

  // Já foi para o paciente: daqui para frente, falhas só vão para o log.
  try {
    const { data: clinic } = await admin
      .from("clinics")
      .select("id, conversation_timeout_hours")
      .eq("id", ctx.clinic.id)
      .single()
      .throwOnError();
    const conversation = await findOrCreateConversation(
      admin,
      clinic,
      phone,
      "equipe",
    );
    await Promise.all([
      admin
        .from("messages")
        .insert({
          clinic_id: ctx.clinic.id,
          conversation_id: conversation.id,
          contact_phone: phone,
          role: "staff",
          origin: "template",
          content: content || `Mensagem pronta: ${template.name}`,
          sent_by: ctx.user.id,
        })
        .throwOnError(),
      admin
        .from("conversations")
        .update({
          attendance_state: "equipe",
          needs_human_at: null,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)
        .throwOnError(),
    ]);
    return { ok: true, conversationId: conversation.id };
  } catch (e) {
    console.error("[atendimento] gravar template:", (e as Error).message);
    return {
      ok: false,
      error: "A mensagem foi enviada, mas não apareceu no painel.",
    };
  }
}
