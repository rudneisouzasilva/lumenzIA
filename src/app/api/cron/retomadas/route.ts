import { cronRoute } from "@/lib/jobs/cron";
import { runFollowUps } from "@/lib/jobs/follow-ups";

// A resposta ao pg_cron sai na hora; o trabalho roda depois, dentro deste limite.
export const maxDuration = 60;

/** Envia as retomadas de conversa do dia (a cada 15 minutos). Chamada pelo pg_cron. */
export const POST = cronRoute("retomadas", () => runFollowUps(50_000));
