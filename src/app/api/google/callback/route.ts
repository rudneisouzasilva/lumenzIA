import { NextResponse, type NextRequest } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { cacheAccessToken, exchangeCode } from "@/lib/google/client";
import { readState, redirectUri, STATE_COOKIE } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Volta do Google: guarda a conta conectada (o token vai para o Vault). */
export async function GET(request: NextRequest) {
  const appUrl = await getAppUrl();
  const back = (status: string) => {
    const response = NextResponse.redirect(
      `${appUrl}/painel/agenda?google=${status}`,
    );
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
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

  // Quem voltou do Google é quem começou, e continua na clínica.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) return back("erro");
  const { data: member } = await supabase
    .from("clinic_members")
    .select("user_id")
    .eq("clinic_id", state.clinicId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return back("erro");

  try {
    const tokens = await exchangeCode(code, redirectUri(appUrl));
    if (!tokens.allGranted) return back("sem-permissao");
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("google_accounts")
      .upsert(
        {
          clinic_id: state.clinicId,
          email: tokens.email,
          status: "ativo",
          last_error: null,
          connected_by: user.id,
        },
        { onConflict: "clinic_id,email" },
      )
      .select("id, refresh_token_secret_id")
      .single()
      .throwOnError();
    if (tokens.refreshToken) {
      await admin
        .rpc("set_google_refresh_token", {
          p_account_id: account.id,
          p_token: tokens.refreshToken,
        })
        .throwOnError();
    } else if (!account.refresh_token_secret_id) {
      return back("sem-permissao");
    }
    cacheAccessToken(account.id, tokens.accessToken, tokens.expiresIn);
  } catch (e) {
    console.error("[google] conectar conta:", (e as Error).message);
    return back("erro");
  }
  return back("conectado");
}
