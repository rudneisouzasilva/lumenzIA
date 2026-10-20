"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import type { FormResult } from "@/lib/auth/validation";
import { getActionContext } from "@/lib/painel/context";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  embeddedSignupConfig,
  retryHistorySync,
} from "@/lib/whatsapp/embedded-signup";
import { ensureTemplatePack } from "@/lib/whatsapp/templates";

const metaId = z.string().regex(/^\d{5,30}$/);
const connectSchema = z.object({
  code: z.string().min(10).max(2000),
  wabaId: metaId,
  phoneNumberId: metaId,
  coexistence: z.boolean(),
});

/** Só a dona da clínica conecta ou desconecta o número (é a conta dela na Meta). */
async function ownerContext() {
  const ctx = await getActionContext();
  if ("error" in ctx) return ctx;
  if (ctx.clinic.role !== "owner") {
    return {
      error: "Só a dona da conta da clínica pode conectar o WhatsApp.",
    };
  }
  return ctx;
}

export async function connectWhatsappAction(
  input: unknown,
): Promise<FormResult & { warning?: string }> {
  const ctx = await ownerContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!embeddedSignupConfig()) {
    return {
      ok: false,
      error: "A conexão com o WhatsApp ainda não está disponível.",
    };
  }
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "A Meta não devolveu os dados do número. Tente de novo.",
    };
  }

  try {
    const result = await connectWhatsapp({
      clinicId: ctx.clinic.id,
      userId: ctx.user.id,
      ...parsed.data,
    });
    if (!result.ok) return result;
    // As mensagens prontas vão para a aprovação da Meta logo depois, sem segurar a tela.
    const clinicId = ctx.clinic.id;
    after(async () => {
      try {
        const errors = await ensureTemplatePack(clinicId);
        if (errors.length) console.warn("[templates]", errors.join(" | "));
      } catch (e) {
        console.error("[templates] pacote:", (e as Error).message);
      }
    });
    refresh();
    return { ok: true, warning: result.warning };
  } catch (e) {
    console.error("[whatsapp] conectar:", (e as Error).message);
    return {
      ok: false,
      error: "Não foi possível salvar a conexão agora. Tente de novo.",
    };
  }
}

export async function disconnectWhatsappAction(): Promise<FormResult> {
  const ctx = await ownerContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  try {
    await disconnectWhatsapp(ctx.clinic.id, {
      userId: ctx.user.id,
      reason: "Desconectado pela clínica",
    });
  } catch (e) {
    console.error("[whatsapp] desconectar:", (e as Error).message);
    return {
      ok: false,
      error: "Não foi possível desconectar agora. Tente de novo.",
    };
  }
  refresh();
  return { ok: true };
}

export async function retryHistorySyncAction(): Promise<FormResult> {
  const ctx = await ownerContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  try {
    const error = await retryHistorySync(ctx.clinic.id);
    if (error) return { ok: false, error };
  } catch (e) {
    console.error("[whatsapp] histórico:", (e as Error).message);
    return { ok: false, error: "Não foi possível pedir agora. Tente de novo." };
  }
  refresh();
  return { ok: true };
}
