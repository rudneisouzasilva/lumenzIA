import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import type { InstagramSender } from "./api";
import { refreshToken } from "./oauth";

type Admin = SupabaseClient<Database>;

// O token vale 60 dias; o job diário renova quando passa de 10 dias, com folga de sobra.
const REFRESH_AFTER_DAYS = 10;

/** A conta conectada que recebeu o aviso, ou null se não é de nenhuma clínica. */
export async function accountByIgUserId(admin: Admin, igUserId: string) {
  const { data } = await admin
    .from("instagram_accounts")
    .select("clinic_id, ig_user_id, username, reply_comments, status")
    .eq("ig_user_id", igUserId)
    .maybeSingle()
    .throwOnError();
  return data;
}

/** Conta e token do Instagram da clínica, para responder. null quando não está conectada. */
export async function getInstagramSender(
  admin: Admin,
  clinicId: string,
): Promise<InstagramSender | null> {
  const [{ data: account }, { data: token }] = await Promise.all([
    admin
      .from("instagram_accounts")
      .select("ig_user_id, status")
      .eq("clinic_id", clinicId)
      .maybeSingle()
      .throwOnError(),
    admin.rpc("get_instagram_token", { p_clinic_id: clinicId }).throwOnError(),
  ]);
  if (!account || account.status !== "ativo" || !token) return null;
  return { igUserId: account.ig_user_id, accessToken: token };
}

/** Renova os tokens que estão ficando velhos. Roda junto com o job diário da agenda. */
export async function refreshInstagramTokens(budgetMs: number) {
  const end = Date.now() + budgetMs;
  const admin = createAdminClient();
  const before = new Date(
    Date.now() - REFRESH_AFTER_DAYS * 86_400_000,
  ).toISOString();
  const { data: due } = await admin
    .from("instagram_accounts")
    .select("clinic_id, token_expires_at")
    .eq("status", "ativo")
    .lt("token_refreshed_at", before)
    .limit(100)
    .throwOnError();

  let refreshed = 0;
  let failed = 0;
  for (const account of due) {
    if (Date.now() > end) break;
    try {
      const { data: token } = await admin
        .rpc("get_instagram_token", { p_clinic_id: account.clinic_id })
        .throwOnError();
      if (!token) throw new Error("sem token guardado");
      const fresh = await refreshToken(token);
      await admin
        .rpc("set_instagram_token", {
          p_clinic_id: account.clinic_id,
          p_token: fresh.accessToken,
        })
        .throwOnError();
      await admin
        .from("instagram_accounts")
        .update({
          token_refreshed_at: new Date().toISOString(),
          token_expires_at: fresh.expiresAt?.toISOString() ?? null,
          last_error: null,
        })
        .eq("clinic_id", account.clinic_id)
        .throwOnError();
      refreshed++;
    } catch (e) {
      failed++;
      const message = (e as Error).message.slice(0, 300);
      console.error("[instagram] renovar token:", message);
      // Vencido não tem volta: a clínica precisa conectar de novo.
      const expired =
        account.token_expires_at &&
        Date.parse(account.token_expires_at) < Date.now();
      await admin
        .from("instagram_accounts")
        .update({
          last_error: message,
          ...(expired ? { status: "desconectado" } : {}),
        })
        .eq("clinic_id", account.clinic_id);
    }
  }
  return { refreshed, failed };
}
