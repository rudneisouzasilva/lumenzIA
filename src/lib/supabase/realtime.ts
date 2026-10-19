import { createClient } from "./client";

/**
 * Cliente do navegador com o login já repassado ao Realtime. Sem isso, um canal aberto antes de a
 * sessão carregar entra como anônimo e o RLS não entrega nenhuma linha.
 */
export async function createRealtimeClient() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
  return supabase;
}
