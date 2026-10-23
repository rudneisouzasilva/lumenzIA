import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { getMyClinic } from "@/lib/billing/subscription";
import { GOOGLE_SCOPES, googleCredentials } from "@/lib/google/client";
import {
  createState,
  redirectUri,
  STATE_COOKIE,
  STATE_MAX_AGE,
} from "@/lib/google/oauth";
import { canAccess } from "@/lib/painel/areas";
import { createClient } from "@/lib/supabase/server";

/** Começa a conexão de uma conta do Google: leva para a tela de autorização do Google. */
export async function GET() {
  const appUrl = await getAppUrl();
  const back = (status: string) =>
    NextResponse.redirect(`${appUrl}/painel/agenda?google=${status}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(`${appUrl}/entrar?next=/painel/agenda`);
  const clinic = await getMyClinic(supabase, user.id);
  if (!clinic || !canAccess(clinic.access, "agenda")) return back("erro");
  const creds = googleCredentials();
  if (!creds) {
    console.error(
      "[google] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados.",
    );
    return back("indisponivel");
  }

  const state = createState(clinic.id, user.id);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(appUrl),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // "consent" garante o refresh token; "select_account" deixa escolher entre várias contas.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  }).toString();

  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/api/google",
    maxAge: STATE_MAX_AGE,
  });
  return response;
}
