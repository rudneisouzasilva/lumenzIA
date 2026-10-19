"use server";

import { z } from "zod";

import { closeConversation } from "@/lib/jobs/close-conversation";
import { getActionContext } from "@/lib/painel/context";
import { publicImageUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendImage, sendText } from "@/lib/whatsapp/client";
import { getClinicSender } from "@/lib/whatsapp/sender";

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
