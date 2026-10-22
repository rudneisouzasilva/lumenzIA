import { refreshInstagramTokens } from "@/lib/instagram/account";
import { cronRoute } from "@/lib/jobs/cron";
import { runAgendaSync } from "@/lib/jobs/agenda-sync";

// A resposta ao pg_cron sai na hora; o trabalho roda depois, dentro deste limite.
export const maxDuration = 60;

/**
 * Sincroniza a cópia local com a agenda de cada clínica e renova os tokens do Instagram (1x por
 * dia). Chamada pelo pg_cron.
 */
export const POST = cronRoute("agenda", async () => ({
  agenda: await runAgendaSync(42_000),
  instagram: await refreshInstagramTokens(8_000),
}));
