import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * O "state" do OAuth do Google: um valor aleatório guardado num cookie e assinado com a clínica e
 * a pessoa que começou a conexão, para o retorno do Google não poder ser forjado nem trocado de
 * clínica.
 */

export const STATE_COOKIE = "lumenzia_google_oauth";
export const STATE_MAX_AGE = 600;

function key() {
  const secret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("sem chave para assinar o state do Google");
  return secret;
}

const sign = (payload: string) =>
  createHmac("sha256", key()).update(payload).digest("base64url");

export function createState(clinicId: string, userId: string) {
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${nonce}.${clinicId}.${userId}`;
  return `${payload}.${sign(payload)}`;
}

/** Confere o state que voltou do Google contra o do cookie. Devolve a clínica e a pessoa. */
export function readState(
  fromGoogle: string | null,
  fromCookie: string | undefined,
) {
  if (!fromGoogle || !fromCookie) return null;
  const a = Buffer.from(fromGoogle);
  const b = Buffer.from(fromCookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parts = fromGoogle.split(".");
  if (parts.length !== 4) return null;
  const [nonce, clinicId, userId, signature] = parts;
  const expected = Buffer.from(sign(`${nonce}.${clinicId}.${userId}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  return { clinicId, userId };
}

export const redirectUri = (appUrl: string) => `${appUrl}/api/google/callback`;
