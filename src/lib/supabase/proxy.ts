import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { panelRedirect } from "@/lib/auth/panel-access";

import type { Database } from "./database.types";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./env";

// Só para quem está logado; sem sessão, vai para o login e volta depois.
const PRIVATE_PREFIXES = [
  "/painel",
  "/admin",
  "/assinatura",
  "/pagamento",
  "/redefinir-senha",
];
// Só para quem NÃO está logado; com sessão, vai direto para o painel (que manda para a
// assinatura quando ela ainda não está ativa).
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
  const userId = data?.claims?.sub;
  const loggedIn = Boolean(userId);
  const { pathname, search } = request.nextUrl;

  if (!loggedIn && matches(pathname, PRIVATE_PREFIXES)) {
    return redirectKeepingCookies(request, response, "/entrar", {
      next: pathname + search,
    });
  }
  // Área da equipe LumenzIA: quem não é admin nem vê a moldura (as páginas conferem de novo).
  if (loggedIn && matches(pathname, ["/admin"])) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin)
      return redirectKeepingCookies(request, response, "/painel", {});
  }
  // Painel da clínica: quem não tem clínica com assinatura ativa nem vê a moldura (sem isso, o
  // menu aparece por um instante antes de a página mandar para /assinatura ou /admin).
  if (userId && matches(pathname, ["/painel"])) {
    const target = await panelRedirect(supabase, userId);
    if (target) return redirectKeepingCookies(request, response, target, {});
  }
  if (loggedIn && matches(pathname, GUEST_ONLY)) {
    const next = request.nextUrl.searchParams.get("next");
    const plan = request.nextUrl.searchParams.get("plano");
    const target =
      next?.startsWith("/") && !next.startsWith("//")
        ? next
        : plan
          ? "/assinatura"
          : "/painel";
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
