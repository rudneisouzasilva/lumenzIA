import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { isValidSignature } from "./client";
import type { WhatsappEvent } from "./inbound";

/**
 * Confere de onde veio um aviso do webhook do WhatsApp.
 *
 * O normal é o aviso vir do app da LumenzIA, assinado com META_APP_SECRET. Uma clínica ligada pelo
 * app dela mesma (conexão manual no /admin) manda os avisos assinados com a Chave Secreta do app
 * dela, guardada no Vault. Nesse caso o aviso só vale se tudo nele for daquela clínica: a conta
 * (WABA) e o número. Assim a chave de uma clínica não serve para falar em nome de outra.
 */
export async function isAuthenticWhatsappEvent(
  raw: string,
  signature: string | null,
): Promise<boolean> {
  const appSecret = process.env.META_APP_SECRET?.trim();
  // Fora de produção e sem app configurado, aceita (testes locais).
  if (!appSecret && process.env.VERCEL_ENV !== "production") return true;
  if (appSecret && isValidSignature(raw, signature, appSecret)) return true;
  if (!signature) return false;

  let body: WhatsappEvent;
  try {
    body = JSON.parse(raw) as WhatsappEvent;
  } catch {
    return false;
  }
  const entries = body.entry ?? [];
  const wabaIds = [...new Set(entries.map((e) => e.id))];
  // Um aviso de app de clínica traz só a conta dela.
  if (wabaIds.length !== 1 || !wabaIds[0]) return false;
  const wabaId = wabaIds[0];

  const admin = createAdminClient();
  const { data: clinics } = await admin
    .from("clinics")
    .select("id, whatsapp_phone_number_id")
    .eq("whatsapp_waba_id", wabaId)
    .limit(5);
  for (const clinic of clinics ?? []) {
    const { data: clinicSecret } = await admin.rpc("get_clinic_secret", {
      p_clinic_id: clinic.id,
      p_kind: "whatsapp_app_secret",
    });
    if (!clinicSecret || !isValidSignature(raw, signature, clinicSecret)) {
      continue;
    }
    return entries.every((entry) =>
      (entry.changes ?? []).every(({ value }) => {
        const phone = value?.metadata?.phone_number_id;
        const waba = value?.waba_info?.waba_id;
        return (
          (!phone || phone === clinic.whatsapp_phone_number_id) &&
          (!waba || waba === wabaId)
        );
      }),
    );
  }
  return false;
}
