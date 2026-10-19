import { cronRoute } from "@/lib/jobs/cron";
import { runReminders } from "@/lib/jobs/reminders";

// A resposta ao pg_cron sai na hora; o trabalho roda depois, dentro deste limite.
export const maxDuration = 60;

/** Envia os lembretes de agendamento (a cada 5 minutos). Chamada pelo pg_cron. */
export const POST = cronRoute("lembretes", () => runReminders(50_000));
