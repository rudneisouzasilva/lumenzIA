"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import { parseBookingFields } from "@/lib/booking-fields";
import { normalizePhone } from "@/lib/format";
import { isEmail, STAFF_CHANNELS } from "@/lib/notifications/channels";
import { getActionContext } from "@/lib/painel/context";

const schema = z.object({
  reminderHoursBefore: z.number().int().min(0).max(168),
  channels: z.array(z.enum(STAFF_CHANNELS)).max(STAFF_CHANNELS.length),
  phone: z.string().trim().max(40),
  email: z.string().trim().toLowerCase().max(254),
  reminderByEmail: z.boolean(),
});

const fail = (error: string): FormResult => ({ ok: false, error });

/** Quando e por onde sai o lembrete do paciente, e os canais e contatos dos avisos à equipe. */
export async function saveNotificationSettings(
  input: unknown,
): Promise<FormResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos.");
  const { reminderHoursBefore, channels, phone, email, reminderByEmail } =
    parsed.data;

  const staffPhone = phone ? normalizePhone(phone) : null;
  if (phone && !staffPhone) {
    return fail("WhatsApp da equipe com DDD, ex.: (11) 99999-0000.");
  }
  if (email && !isEmail(email)) return fail("E-mail da equipe inválido.");
  if (!channels.length) {
    return fail("Escolha pelo menos um canal para avisar a equipe.");
  }
  if (channels.includes("whatsapp") && !staffPhone) {
    return fail("Informe o WhatsApp da equipe ou desligue esse canal.");
  }
  if (channels.includes("email") && !email) {
    return fail("Informe o e-mail da equipe ou desligue esse canal.");
  }

  const ctx = await getActionContext("avisos");
  if ("error" in ctx) return fail(ctx.error);

  if (reminderByEmail) {
    const { data, error } = await ctx.supabase
      .from("clinics")
      .select("booking_fields")
      .eq("id", ctx.clinic.id)
      .single();
    if (error) return fail("Não foi possível salvar agora. Tente de novo.");
    if (parseBookingFields(data.booking_fields).email === "desligado") {
      return fail(
        "Para lembrar por e-mail, peça o e-mail em Roteiro de atendimento › Dados do agendamento.",
      );
    }
  }

  const [clinic, integration] = await Promise.all([
    ctx.supabase
      .from("clinics")
      .update({
        staff_alert_channels: channels,
        staff_phone_number: staffPhone,
        staff_alert_email: email || null,
        reminder_by_email: reminderByEmail,
      })
      .eq("id", ctx.clinic.id),
    ctx.supabase
      .from("integrations")
      .update({ reminder_hours_before: reminderHoursBefore })
      .eq("clinic_id", ctx.clinic.id),
  ]);
  const error = clinic.error ?? integration.error;
  if (error) {
    console.error("[painel] lembretes e avisos:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}
