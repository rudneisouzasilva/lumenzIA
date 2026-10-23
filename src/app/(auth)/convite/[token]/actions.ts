"use server";

import { redirect } from "next/navigation";

import { inviteSignUpSchema, type FormResult } from "@/lib/auth/validation";
import { getMyClinic } from "@/lib/billing/subscription";
import { findInvite } from "@/lib/painel/invites";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Aceite do convite da equipe. O convite é marcado como usado antes de criar o vínculo, e só se
 * ninguém usou: dois cliques ao mesmo tempo não criam duas entradas.
 */

const fail = (error: string): FormResult => ({ ok: false, error });

type Admin = ReturnType<typeof createAdminClient>;

async function join(
  admin: Admin,
  invite: Extract<Awaited<ReturnType<typeof findInvite>>, { status: "open" }>,
  userId: string,
): Promise<FormResult | null> {
  const { data: claimed } = await admin
    .from("clinic_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .select("id");
  if (!claimed?.length) return fail("Este convite já foi usado.");

  const { error } = await admin.from("clinic_members").insert({
    clinic_id: invite.clinicId,
    user_id: userId,
    role: "staff",
    permissions: invite.permissions,
  });
  if (error) {
    console.error("[convite] entrar na equipe:", error.message);
    await admin
      .from("clinic_invites")
      .update({ accepted_at: null, accepted_by: null })
      .eq("id", invite.id);
    return fail("Não foi possível concluir agora. Tente de novo.");
  }
  return null;
}

/** Quem ainda não tem conta: cria com o e-mail do convite (já conta como confirmado). */
export async function acceptWithNewAccount(
  token: string,
  input: unknown,
): Promise<FormResult> {
  const parsed = inviteSignUpSchema.safeParse(input);
  if (!parsed.success) return fail("Confira os campos destacados.");
  const invite = await findInvite(token);
  if (invite.status !== "open") return fail("Este convite não vale mais.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: invite.email,
    password: parsed.data.password,
    // O link chegou para este e-mail (ou pela dona da clínica, que conhece a pessoa).
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return fail(
        "Já existe uma conta com este e-mail. Use “Já tenho conta” para entrar e aceitar.",
      );
    }
    if (error.code === "weak_password") {
      return fail(
        "Senha fraca: use pelo menos 8 caracteres, misturando letras e números.",
      );
    }
    console.error("[convite] criar conta:", error.code, error.message);
    return fail("Não foi possível criar a conta agora. Tente de novo.");
  }

  const joined = await join(admin, invite, data.user.id);
  if (joined) {
    // Sem o vínculo, a conta nova não serve para nada: apaga para a pessoa poder tentar de novo.
    await admin.auth.admin.deleteUser(data.user.id);
    return joined;
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password: parsed.data.password,
  });
  if (signInError) redirect("/entrar?next=/painel");
  redirect("/painel");
}

/** Quem já tem conta e está logado com o e-mail convidado. */
export async function acceptWithCurrentAccount(
  token: string,
): Promise<FormResult> {
  const invite = await findInvite(token);
  if (invite.status !== "open") return fail("Este convite não vale mais.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Entre na sua conta primeiro.");
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return fail(`Este convite é para ${invite.email}.`);
  }
  if (await getMyClinic(supabase, user.id)) {
    return fail(
      "Sua conta já faz parte de uma clínica. Por enquanto, cada conta fica em uma clínica só.",
    );
  }

  const joined = await join(createAdminClient(), invite, user.id);
  if (joined) return joined;
  redirect("/painel");
}
