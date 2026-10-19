import { cronRoute } from "@/lib/jobs/cron";
import { runClassification } from "@/lib/jobs/classify";

// A resposta ao pg_cron sai na hora; o trabalho roda depois, dentro deste limite.
export const maxDuration = 60;

/** Encerra e classifica as conversas paradas (a cada 15 minutos). Chamada pelo pg_cron. */
export const POST = cronRoute("classificar", () => runClassification(50_000));
