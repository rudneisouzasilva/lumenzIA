import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./env";

// Só para quem está logado; sem sessão, vai para o login e volta depois.
const PRIVATE_PREFIXES = ["/assinatura", "/pagamento", "/redefinir-senha"];
// Só para quem NÃO está logado; com sessão, vai direto para a assinatura.
const GUEST_ONLY = ["/entrar", "/cadastro"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessão do Supabase (cookies) antes de cada página ser renderizada e manda para o
 * login quem abre uma área logada sem sessão. As páginas conferem o usuário de novo no servidor.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Não coloque código entre a criação do cliente e esta chamada: é ela que renova o token.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!loggedIn && matches(pathname, PRIVATE_PREFIXES)) {
    return redirectKeepingCookies(request, response, "/entrar", {
      next: pathname + search,
    });
  }
  if (loggedIn && matches(pathname, GUEST_ONLY)) {
    const next = request.nextUrl.searchParams.get("next");
    const plan = request.nextUrl.searchParams.get("plano");
    const target =
      next?.startsWith("/") && !next.startsWith("//") ? next : "/assinatura";
    return redirectKeepingCookies(request, response, target, {
      ...(plan && !next ? { plano: plan } : {}),
    });
  }

  return response;
}

/** Redireciona sem perder os cookies de sessão que acabaram de ser renovados. */
function redirectKeepingCookies(
  request: NextRequest,
  response: NextResponse,
  path: string,
  params: Record<string, string>,
) {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
