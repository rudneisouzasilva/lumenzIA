import "server-only";

import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Pessoa logada, conferida no Supabase Auth (não confia só no cookie). Redireciona para o login
 * quando não há sessão. Lê cookies: quem chama precisa estar dentro de um <Suspense>.
 */
export async function requireUser(next = "/assinatura") {
  // Sempre na hora do pedido: a sessão e as datas de validade dependem do relógio.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}
