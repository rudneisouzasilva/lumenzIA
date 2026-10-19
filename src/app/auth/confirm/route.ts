import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino dos links dos e-mails do Supabase Auth (confirmar cadastro, redefinir senha). Aceita os
 * dois formatos: ?code= (link padrão do Supabase, fluxo PKCE) e ?token_hash=&type= (modelo de
 * e-mail personalizado, que funciona mesmo se o link for aberto em outro navegador).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) console.error("[auth] confirm (code):", error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    ok = !error;
    if (error) console.error("[auth] confirm (token):", error.message);
  }

  const target = ok
    ? next
    : `/entrar?erro=${next === "/redefinir-senha" ? "link-senha" : "link"}`;
  return NextResponse.redirect(new URL(target, request.url));
}
