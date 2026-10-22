import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { getMyClinic } from "@/lib/billing/subscription";
import {
  authorizeUrl,
  createState,
  instagramCredentials,
  STATE_COOKIE,
  STATE_MAX_AGE,
} from "@/lib/instagram/oauth";
import { createClient } from "@/lib/supabase/server";

/** Começa a conexão do Instagram: leva para a tela de login do Instagram. */
export async function GET() {
  const appUrl = await getAppUrl();
  const back = (status: string) =>
    NextResponse.redirect(`${appUrl}/painel/instagram?instagram=${status}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(`${appUrl}/entrar?next=/painel/instagram`);
  const clinic = await getMyClinic(supabase, user.id);
  if (!clinic) return back("erro");
  if (clinic.role !== "owner") return back("so-dona");
  const creds = instagramCredentials();
  if (!creds) {
    console.error(
      "[instagram] INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET não configurados.",
    );
    return back("indisponivel");
  }

  const state = createState(clinic.id, user.id);
  const response = NextResponse.redirect(
    authorizeUrl(creds.appId, appUrl, state),
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: STATE_MAX_AGE,
  });
  return response;
}
