import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONVERSATION_TIMEOUT_HOURS } from "@/lib/whatsapp/inbound";

import { closeConversation } from "./close-conversation";
import { deadline } from "./cron";

const BATCH = 40;
// Se a IA estiver fora do ar por muito tempo, a conversa fecha sem motivo para não travar a fila.
const GIVE_UP_AFTER_MS = 48 * 3600_000;

/**
 * Encerra e classifica as conversas paradas há mais que o tempo limite de cada clínica.
 * Roda a cada 15 minutos; o que não couber no tempo fica para a próxima rodada.
 */
export async function runClassification(budgetMs: number) {
  const admin = createAdminClient();
  const { data: idle } = await admin
    .rpc("idle_conversations", {
      p_default_hours: DEFAULT_CONVERSATION_TIMEOUT_HOURS,
      p_limit: BATCH,
    })
    .throwOnError();

  const hasTime = deadline(budgetMs);
  let closed = 0;
  let failed = 0;
  for (const conversation of idle) {
    if (!hasTime()) break;
    try {
      const stale =
        Date.now() - Date.parse(conversation.last_message_at) >
        GIVE_UP_AFTER_MS;
      if (await closeConversation(admin, conversation, { fallback: stale }))
        closed++;
    } catch (e) {
      failed++;
      console.error(
        `[classificar] conversa ${conversation.id}:`,
        (e as Error).message,
      );
    }
  }
  return { found: idle.length, closed, failed };
}
