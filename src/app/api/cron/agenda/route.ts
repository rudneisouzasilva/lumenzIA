import { cronRoute } from "@/lib/jobs/cron";
import { runAgendaSync } from "@/lib/jobs/agenda-sync";

// A resposta ao pg_cron sai na hora; o trabalho roda depois, dentro deste limite.
export const maxDuration = 60;

/** Sincroniza a cópia local com a agenda de cada clínica (1x por dia). Chamada pelo pg_cron. */
export const POST = cronRoute("agenda", () => runAgendaSync(50_000));
