import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

/**
 * Cliente com a chave secreta: IGNORA o RLS. Use só no servidor, em webhooks, jobs e ações da
 * equipe LumenzIA, sempre depois de conferir quem está pedindo.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Supabase não configurado: preencha NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.",
    );
  }

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
