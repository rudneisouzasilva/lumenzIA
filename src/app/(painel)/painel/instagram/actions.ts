"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import { getActionContext } from "@/lib/painel/context";
import { createAdminClient } from "@/lib/supabase/admin";

const fail = (error: string): FormResult => ({ ok: false, error });

/** Só a dona da clínica muda a conexão (é a conta dela no Instagram). */
async function ownerContext() {
  const ctx = await getActionContext("instagram");
  if ("error" in ctx) return ctx;
  if (ctx.clinic.role !== "owner") {
    return {
      error: "Só a dona da conta da clínica pode mudar o Instagram.",
    };
  }
  return ctx;
}

/** Liga ou desliga a resposta no privado para quem comenta nos posts. */
export async function setReplyComments(value: unknown): Promise<FormResult> {
  const parsed = z.boolean().safeParse(value);
  if (!parsed.success) return fail("Valor inválido.");
  const ctx = await ownerContext();
  if ("error" in ctx) return fail(ctx.error);

  const { data, error } = await createAdminClient()
    .from("instagram_accounts")
    .update({ reply_comments: parsed.data })
    .eq("clinic_id", ctx.clinic.id)
    .select("clinic_id");
  if (error) {
    console.error("[instagram] comentários:", error.message);
    return fail("Não foi possível salvar agora. Tente de novo.");
  }
  if (!data.length) return fail("O Instagram não está conectado.");
  refresh();
  return { ok: true };
}

/**
 * Desconecta: apaga a conta e o token (a clínica pode remover o app também nas configurações do
 * Instagram). As conversas continuam no painel.
 */
export async function disconnectInstagram(): Promise<FormResult> {
  const ctx = await ownerContext();
  if ("error" in ctx) return fail(ctx.error);
  const { error } = await createAdminClient()
    .from("instagram_accounts")
    .delete()
    .eq("clinic_id", ctx.clinic.id);
  if (error) {
    console.error("[instagram] desconectar:", error.message);
    return fail("Não foi possível desconectar agora. Tente de novo.");
  }
  refresh();
  return { ok: true };
}
