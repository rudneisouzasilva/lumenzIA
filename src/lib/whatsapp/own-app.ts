import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { graph } from "./graph";
import { ensureTemplatePack, syncTemplates } from "./templates";

/**
 * Ativa o WhatsApp de uma clínica ligada pelo app dela mesma (conexão manual no /admin), enquanto
 * a LumenzIA não tem o Cadastro Incorporado liberado pela Meta. Com o token guardado:
 *  1. confere que o número pertence à conta (WABA) informada e pega o nome verificado;
 *  2. inscreve o app da clínica nos avisos da conta (sem isso as mensagens não chegam);
 *  3. traz os templates que a clínica já tem e envia o pacote da LumenzIA para aprovação.
 * O endereço do webhook e os campos são configurados no painel do app dela, na Meta.
 */
export async function activateOwnAppWhatsapp(
  clinicId: string,
  userId: string,
): Promise<{ ok: true; notes: string[] } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_connected_at")
    .eq("id", clinicId)
    .single()
    .throwOnError();
  const [{ data: token }, { data: appSecret }] = await Promise.all([
    admin.rpc("get_clinic_secret", {
      p_clinic_id: clinicId,
      p_kind: "whatsapp_token",
    }),
    admin.rpc("get_clinic_secret", {
      p_clinic_id: clinicId,
      p_kind: "whatsapp_app_secret",
    }),
  ]);
  const phoneNumberId = clinic.whatsapp_phone_number_id;
  const wabaId = clinic.whatsapp_waba_id;
  if (!phoneNumberId || !wabaId || !token) {
    return {
      ok: false,
      error: "Salve antes o Phone Number ID, o WABA ID e o token.",
    };
  }

  let phone:
    | { id: string; display_phone_number?: string; verified_name?: string }
    | undefined;
  try {
    const { data: numbers } = await graph<{
      data?: NonNullable<typeof phone>[];
    }>(
      `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
      { token },
    );
    phone = numbers?.find((n) => n.id === phoneNumberId);
  } catch (e) {
    return {
      ok: false,
      error: `A Meta recusou o token para esta conta: ${(e as Error).message}`,
    };
  }
  if (!phone) {
    return {
      ok: false,
      error: "Este Phone Number ID não pertence ao WABA informado.",
    };
  }
  try {
    await graph(`${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: "POST",
      token,
    });
  } catch (e) {
    return {
      ok: false,
      error: `A Meta não deixou inscrever o app na conta: ${(e as Error).message}`,
    };
  }

  await admin
    .from("clinics")
    .update({
      whatsapp_display_phone: phone.display_phone_number ?? null,
      whatsapp_verified_name: phone.verified_name ?? null,
      whatsapp_connected_at:
        clinic.whatsapp_connected_at ?? new Date().toISOString(),
    })
    .eq("id", clinicId)
    .throwOnError();

  const notes: string[] = [];
  if (!appSecret && !process.env.META_APP_SECRET?.trim()) {
    notes.push("Sem Chave Secreta do app: o webhook vai recusar os avisos.");
  } else if (!appSecret) {
    notes.push(
      "Sem a Chave Secreta do app da clínica, só chegam avisos assinados pelo app da LumenzIA.",
    );
  }
  const syncError = await syncTemplates(clinicId);
  if (syncError) notes.push(syncError);
  const packErrors = await ensureTemplatePack(clinicId);
  notes.push(...packErrors);

  await admin.from("admin_audit_log").insert({
    admin_id: userId,
    clinic_id: clinicId,
    action: "whatsapp.conectado",
    details: `Conectado pelo app da própria clínica: número ${phone.display_phone_number ?? phoneNumberId}, WABA ${wabaId}${notes.length ? `; avisos: ${notes.length}` : ""}.`,
  });
  return { ok: true, notes };
}
