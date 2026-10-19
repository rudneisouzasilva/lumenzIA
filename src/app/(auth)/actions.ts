"use server";

import { redirect } from "next/navigation";

import { getAppUrl, safeNextPath } from "@/lib/app-url";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type FormResult,
} from "@/lib/auth/validation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const notConfigured: FormResult = {
  ok: false,
  error: "O login ainda não está configurado neste ambiente.",
};

/** Traduz os erros do Supabase Auth para mensagens que a pessoa entende. */
function authErrorMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com este e-mail. Tente entrar.";
    case "weak_password":
      return "Senha fraca: use pelo menos 8 caracteres, misturando letras e números.";
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    case "signup_disabled":
      return "Novos cadastros estão desativados no momento.";
    default:
      console.error("[auth]", error.code, error.message);
      return "Não foi possível concluir agora. Tente novamente em instantes.";
  }
}

function invalid(): FormResult {
  return { ok: false, error: "Confira os campos destacados." };
}

export async function signIn(
  input: unknown,
  next?: string,
): Promise<FormResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!isSupabaseConfigured) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authErrorMessage(error) };

  redirect(safeNextPath(next));
}

/**
 * Cria a conta. O nome da clínica vai em options.data: o gatilho do banco (handle_new_user) cria o
 * perfil e a clínica, com a pessoa como dona.
 */
export async function signUp(
  input: unknown,
  planCode?: string,
): Promise<FormResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!isSupabaseConfigured) return notConfigured;

  const { email, password, fullName, clinicName, phone } = parsed.data;
  const next = planCode
    ? `/assinatura?plano=${encodeURIComponent(planCode)}`
    : "/assinatura";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await getAppUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: {
        full_name: fullName,
        clinic_name: clinicName,
        phone: phone.replace(/\D/g, ""),
      },
    },
  });
  if (error) return { ok: false, error: authErrorMessage(error) };

  // Com a confirmação de e-mail ligada, o Supabase não diz se o e-mail já existia: devolve um
  // usuário sem identidades.
  if (data.user && data.user.identities?.length === 0) {
    return {
      ok: false,
      error: "Já existe uma conta com este e-mail. Tente entrar.",
    };
  }

  // Confirmação de e-mail desligada no Supabase: já entra direto.
  if (data.session) redirect(next);

  return { ok: true };
}

export async function requestPasswordReset(
  input: unknown,
): Promise<FormResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!isSupabaseConfigured) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${await getAppUrl()}/auth/confirm?next=/redefinir-senha`,
    },
  );
  // Não conta se o e-mail existe ou não: a resposta é sempre a mesma, exceto por limite de envio.
  if (error && error.code?.startsWith("over_")) {
    return { ok: false, error: authErrorMessage(error) };
  }
  if (error) console.error("[auth] reset:", error.code, error.message);
  return { ok: true };
}

export async function updatePassword(input: unknown): Promise<FormResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!isSupabaseConfigured) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "session_not_found" || error.status === 401) {
      return {
        ok: false,
        error: "O link expirou. Peça um novo em “Esqueci minha senha”.",
      };
    }
    return { ok: false, error: authErrorMessage(error) };
  }
  redirect("/assinatura?senha=alterada");
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/entrar");
}
