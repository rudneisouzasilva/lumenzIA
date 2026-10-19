import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import {
  assertSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./env";

/** Cliente para Client Components. Acessa o banco como o usuário logado (protegido pelo RLS). */
export function createClient() {
  assertSupabaseConfigured();
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
