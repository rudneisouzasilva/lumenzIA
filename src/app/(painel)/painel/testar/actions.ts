"use server";

import { z } from "zod";

import { AiError, generateReply, loadAssistantContext } from "@/lib/ai/engine";
import { getActionContext } from "@/lib/painel/context";
import { publicImageUrl } from "@/lib/storage";

const testSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().max(4000),
      }),
    )
    .max(40),
  sentImageIds: z.array(z.uuid()).max(50),
});

export type TestReply =
  | {
      ok: true;
      reply: string;
      images: { id: string; url: string; description: string }[];
      toolCalls: { name: string; args: Record<string, unknown> }[];
      needsHuman: boolean;
    }
  | { ok: false; error: string };

/**
 * Aba Testar: a mesma IA do WhatsApp, com o que está salvo no painel. Nada é gravado, nada vai
 * para o WhatsApp, não conta na cota e a agenda só é simulada. O histórico e as fotos já
 * mostradas ficam no navegador e voltam a cada mensagem.
 */
export async function testAssistant(input: unknown): Promise<TestReply> {
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Escreva uma mensagem de até 1000 caracteres." };
  }
  const ctx = await getActionContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { message, history, sentImageIds } = parsed.data;
  try {
    const { integration, ...context } = await loadAssistantContext(
      ctx.supabase,
      ctx.clinic.id,
    );
    const out = await generateReply({
      context,
      history: [...history.slice(-20), { role: "user", text: message }],
      sentImageIds,
      agenda: integration?.enabled ? { kind: "simulate" } : null,
    });
    return {
      ok: true,
      reply: out.text,
      images: out.images.map((img) => ({
        id: img.id,
        url: publicImageUrl(img.storage_path),
        description: img.description,
      })),
      toolCalls: out.toolCalls.map(({ name, args }) => ({ name, args })),
      needsHuman: out.needsHuman,
    };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.message };
    console.error("[testar]", (e as Error).message);
    return {
      ok: false,
      error: "Não foi possível testar agora. Tente de novo em instantes.",
    };
  }
}
