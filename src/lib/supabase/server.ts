import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import {
  assertSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./env";

/**
 * Cliente para Server Components, Server Actions e Route Handlers, como o usuário logado
 * (protegido pelo RLS). Crie um por requisição. Com Cache Components, quem lê a sessão
 * precisa ficar dentro de um <Suspense>.
 */
export async function createClient() {
  assertSupabaseConfigured();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado de um Server Component, onde não dá para gravar cookies: o proxy
          // (src/proxy.ts) já renova a sessão a cada requisição.
        }
      },
    },
  });
}
