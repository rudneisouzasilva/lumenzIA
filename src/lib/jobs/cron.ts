import "server-only";

import { timingSafeEqual } from "node:crypto";

import { after, NextResponse, type NextRequest } from "next/server";

/** Confere a senha dos jobs (cabeçalho Authorization: Bearer <CRON_SECRET>). */
function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rota de job chamada pelo pg_cron: confere a senha, responde na hora e faz o trabalho depois
 * (o pg_net não espera a resposta). Sem CRON_SECRET configurado, recusa tudo.
 */
export function cronRoute(name: string, job: () => Promise<unknown>) {
  return function handler(request: NextRequest) {
    if (!isAuthorized(request)) {
      if (!process.env.CRON_SECRET) {
        console.error(
          `[${name}] CRON_SECRET não configurado: chamada recusada.`,
        );
      }
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    after(async () => {
      const started = Date.now();
      try {
        const result = await job();
        console.log(
          `[${name}] concluído em ${Date.now() - started} ms:`,
          JSON.stringify(result),
        );
      } catch (e) {
        console.error(`[${name}] falhou:`, (e as Error).message);
      }
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  };
}

/** Para laços longos: para de pegar itens novos antes de estourar o tempo da função. */
export function deadline(ms: number) {
  const end = Date.now() + ms;
  return () => Date.now() < end;
}
