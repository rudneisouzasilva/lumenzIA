/**
 * Variáveis públicas do Supabase. Enquanto o projeto não estiver configurado (.env.local vazio),
 * `isSupabaseConfigured` fica falso e o site continua funcionando sem login.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase não configurado: preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local.",
    );
  }
}
