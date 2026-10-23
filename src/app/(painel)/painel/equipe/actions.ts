"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getAppUrl } from "@/lib/app-url";
import type { FormResult } from "@/lib/auth/validation";
import { emailConfigured, sendEmail } from "@/lib/notifications/email";
import { AREAS, type Area } from "@/lib/painel/areas";
import { getActionContext } from "@/lib/painel/context";
import { newInviteToken } from "@/lib/painel/invites";
import {
  INVITE_DAYS,
  inviteSchema,
  memberAreasSchema,
} from "@/lib/painel/team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tela Equipe: só a dona convida, muda as telas de cada pessoa e tira alguém da clínica. As
 * gravações usam a chave secreta (convites e membros não aceitam escrita do navegador); a clínica
 * vem sempre do login.
 */

export type InviteResult =
  { ok: true; link: string; emailed: boolean } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

function inviteEmail(
  clinicName: string,
  name: string,
  link: string,
  areas: Area[],
) {
  return [
    `Olá, ${name.split(" ")[0]}!`,
    "",
    `Você foi convidada(o) para a equipe da ${clinicName} na LumenzIA, com acesso a: ${areas
      .map((a) => AREAS[a].label)
      .join(", ")}.`,
    "",
    `Para criar sua conta (ou entrar com a que você já tem), abra o link abaixo. Ele vale ${INVITE_DAYS} dias:`,
    link,
    "",
    "Se você não esperava este convite, é só ignorar este e-mail.",
  ].join("\n");
}

/** Cria o convite e devolve o link para a dona copiar; também manda por e-mail quando dá. */
export async function inviteMember(input: unknown): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Confira os campos.");
  }
  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: members } = await ctx.supabase.rpc("clinic_member_emails", {
    p_clinic_id: ctx.clinic.id,
  });
  if (members?.some((m) => m.email?.toLowerCase() === v.email)) {
    return fail("Essa pessoa já faz parte da equipe.");
  }

  // Um convite em aberto por e-mail: convidar de novo troca o link e as telas.
  await admin
    .from("clinic_invites")
    .delete()
    .eq("clinic_id", ctx.clinic.id)
    .eq("email", v.email)
    .is("accepted_at", null);

  const { token, hash } = newInviteToken();
  const { error } = await admin.from("clinic_invites").insert({
    clinic_id: ctx.clinic.id,
    full_name: v.fullName,
    email: v.email,
    permissions: v.areas,
    token_hash: hash,
    created_by: ctx.user.id,
  });
  if (error) {
    console.error("[equipe] convite:", error.message);
    return fail("Não foi possível criar o convite agora. Tente de novo.");
  }

  const link = `${await getAppUrl()}/convite/${token}`;
  let emailed = false;
  if (emailConfigured()) {
    try {
      await sendEmail({
        to: v.email,
        subject: `Convite para a equipe da ${ctx.clinic.name}`,
        text: inviteEmail(ctx.clinic.name, v.fullName, link, v.areas),
        fromName: ctx.clinic.name,
      });
      emailed = true;
    } catch (e) {
      console.error("[equipe] e-mail do convite:", (e as Error).message);
    }
  }
  refresh();
  return { ok: true, link, emailed };
}

export async function cancelInvite(id: unknown): Promise<FormResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return fail("Convite inválido.");
  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  const { error } = await createAdminClient()
    .from("clinic_invites")
    .delete()
    .eq("id", parsed.data)
    .eq("clinic_id", ctx.clinic.id)
    .is("accepted_at", null);
  if (error) {
    console.error("[equipe] cancelar convite:", error.message);
    return fail("Não foi possível cancelar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}

/** Troca as telas liberadas de uma pessoa da equipe (a dona sempre vê tudo). */
export async function saveMemberAreas(input: unknown): Promise<FormResult> {
  const parsed = memberAreasSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Confira as telas.");
  }
  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  const { data, error } = await createAdminClient()
    .from("clinic_members")
    .update({ permissions: parsed.data.areas })
    .eq("clinic_id", ctx.clinic.id)
    .eq("user_id", parsed.data.userId)
    .eq("role", "staff")
    .select("user_id");
  if (error) {
    console.error("[equipe] telas:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  if (!data.length) return fail("Pessoa não encontrada na equipe.");
  refresh();
  return { ok: true };
}

/** Tira a pessoa da clínica. A conta dela continua existindo, sem acesso ao painel. */
export async function removeMember(userId: unknown): Promise<FormResult> {
  const parsed = z.uuid().safeParse(userId);
  if (!parsed.success) return fail("Pessoa inválida.");
  const ctx = await getActionContext("owner");
  if ("error" in ctx) return fail(ctx.error);
  const { data, error } = await createAdminClient()
    .from("clinic_members")
    .delete()
    .eq("clinic_id", ctx.clinic.id)
    .eq("user_id", parsed.data)
    .eq("role", "staff")
    .select("user_id");
  if (error) {
    console.error("[equipe] remover:", error.message);
    return fail("Não foi possível remover agora. Tente de novo.");
  }
  if (!data.length) return fail("Pessoa não encontrada na equipe.");
  refresh();
  return { ok: true };
}
