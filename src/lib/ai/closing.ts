import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Encerrar o atendimento
 * ----------------------
 * Quando o assunto termina (agendamento confirmado, dúvida respondida), a assistente avisa que
 * encerra o atendimento em alguns minutos se for só isso. A conversa fica marcada e o job de
 * classificação a encerra depois desse tempo, a menos que a pessoa (ou a equipe) escreva antes.
 */

/** Minutos entre o aviso e o encerramento (o mesmo número está na migração 0026). */
export const CLOSE_AFTER_MINUTES = 10;

export type ClosingMode =
  { kind: "live"; conversationId: number } | { kind: "simulate" } | null;

/** Marca a conversa para encerrar (a IA escreveu [[ENCERRAR]]). Nunca lança erro. */
export async function callCloseTool(
  mode: NonNullable<ClosingMode>,
): Promise<Record<string, unknown>> {
  if (mode.kind === "simulate") {
    return {
      ok: true,
      aviso: `Simulação do modo de teste: numa conversa real, o atendimento seria encerrado em ${CLOSE_AFTER_MINUTES} minutos se a pessoa não escrevesse mais nada.`,
    };
  }
  const { error } = await createAdminClient()
    .from("conversations")
    .update({ close_requested_at: new Date().toISOString() })
    .eq("id", mode.conversationId)
    .eq("status", "aberta");
  if (error) {
    console.error("[encerrar] marcar conversa:", error.message);
    return { erro: "Não foi possível marcar o encerramento agora." };
  }
  return { ok: true, encerra_em_minutos: CLOSE_AFTER_MINUTES };
}
