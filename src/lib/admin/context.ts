import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

/**
 * Quem abre o painel da equipe: logado e com profiles.is_admin. Para os demais a área nem existe
 * (404). Memorizado por requisição; lê cookies, então quem chama fica dentro de um <Suspense>.
 */
export const getAdminContext = cache(async () => {
  const { supabase, user } = await requireUser("/admin");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();
  return { supabase, user };
});

/** O mesmo para Server Actions: devolve o motivo em vez de redirecionar. */
export async function getAdminActionContext(): Promise<
  | { error: string }
  | { supabase: Awaited<ReturnType<typeof createClient>>; user: User }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre de novo." };
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { error: "Acesso restrito à equipe LumenzIA." };
  return { supabase, user };
}
