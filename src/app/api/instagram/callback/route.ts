import { NextResponse, type NextRequest } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import {
  exchangeCode,
  fetchAccount,
  readState,
  STATE_COOKIE,
  subscribeWebhooks,
} from "@/lib/instagram/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Volta do Instagram: guarda a conta conectada (o token vai para o Vault) e liga os avisos. */
export async function GET(request: NextRequest) {
  const appUrl = await getAppUrl();
  const back = (status: string) => {
    const response = NextResponse.redirect(
      `${appUrl}/painel/instagram?instagram=${status}`,
    );
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/instagram" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const state = readState(
    params.get("state"),
    request.cookies.get(STATE_COOKIE)?.value,
  );
  if (!state) return back("erro");
  if (params.get("error")) return back("cancelado");
  const code = params.get("code");
  if (!code) return back("erro");

  // Quem voltou do Instagram é quem começou, e continua dona da clínica.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) return back("erro");
  const { data: member } = await supabase
    .from("clinic_members")
    .select("role")
    .eq("clinic_id", state.clinicId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return back("erro");
  if (member.role !== "owner") return back("so-dona");

  try {
    const token = await exchangeCode(code, appUrl);
    if (
      token.permissions.length &&
      !token.permissions.includes("instagram_business_manage_messages")
    ) {
      return back("sem-permissao");
    }
    const account = await fetchAccount(token.accessToken);
    const admin = createAdminClient();

    // Uma conta do Instagram atende uma clínica só.
    const { data: other } = await admin
      .from("instagram_accounts")
      .select("clinic_id")
      .eq("ig_user_id", account.igUserId)
      .neq("clinic_id", state.clinicId)
      .maybeSingle()
      .throwOnError();
    if (other) return back("em-uso");

    await admin
      .from("instagram_accounts")
      .upsert(
        {
          clinic_id: state.clinicId,
          ig_user_id: account.igUserId,
          username: account.username,
          name: account.name,
          token_expires_at: token.expiresAt?.toISOString() ?? null,
          token_refreshed_at: new Date().toISOString(),
          status: "ativo",
          last_error: null,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id" },
      )
      .throwOnError();
    await admin
      .rpc("set_instagram_token", {
        p_clinic_id: state.clinicId,
        p_token: token.accessToken,
      })
      .throwOnError();

    try {
      await subscribeWebhooks(token.accessToken);
    } catch (e) {
      const message = (e as Error).message.slice(0, 300);
      console.error("[instagram] ligar avisos:", message);
      await admin
        .from("instagram_accounts")
        .update({ last_error: `Avisos do webhook: ${message}` })
        .eq("clinic_id", state.clinicId);
      return back("sem-avisos");
    }
  } catch (e) {
    console.error("[instagram] conectar conta:", (e as Error).message);
    return back("erro");
  }
  return back("conectado");
}
