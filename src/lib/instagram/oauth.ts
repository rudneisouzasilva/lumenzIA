import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { instagramApi } from "./api";

/**
 * Login do Instagram (Instagram API with Instagram Login): a clínica entra com a conta
 * profissional dela, sem precisar de Página do Facebook. O app é o mesmo da Meta usado no
 * WhatsApp, com o produto "Instagram" adicionado (ele tem um id e uma chave próprios).
 */

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

export const STATE_COOKIE = "lumenzia_instagram_oauth";
export const STATE_MAX_AGE = 600;

export function instagramCredentials() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

export const redirectUri = (appUrl: string) =>
  `${appUrl}/api/instagram/callback`;

// ---------------------------------------------------------------------
// state: aleatório, num cookie, assinado com a clínica e a pessoa (o retorno não pode ser forjado)
// ---------------------------------------------------------------------
function key() {
  const secret =
    process.env.INSTAGRAM_APP_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) throw new Error("sem chave para assinar o state do Instagram");
  return secret;
}

const sign = (payload: string) =>
  createHmac("sha256", key()).update(payload).digest("base64url");

export function createState(clinicId: string, userId: string) {
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${nonce}.${clinicId}.${userId}`;
  return `${payload}.${sign(payload)}`;
}

export function readState(
  fromInstagram: string | null,
  fromCookie: string | undefined,
) {
  if (!fromInstagram || !fromCookie) return null;
  const a = Buffer.from(fromInstagram);
  const b = Buffer.from(fromCookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parts = fromInstagram.split(".");
  if (parts.length !== 4) return null;
  const [nonce, clinicId, userId, signature] = parts;
  const expected = Buffer.from(sign(`${nonce}.${clinicId}.${userId}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  return { clinicId, userId };
}

export function authorizeUrl(appId: string, appUrl: string, state: string) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(appUrl),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    // Mostra a tela de login do Instagram mesmo se já houver alguém logado (troca de conta).
    force_reauth: "true",
    state,
  }).toString();
  return url;
}

// ---------------------------------------------------------------------
// Tokens: o código vira um token de 1 hora, trocado na hora por um de 60 dias
// ---------------------------------------------------------------------
export type LongLivedToken = { accessToken: string; expiresAt: Date | null };

const expiry = (seconds: unknown) =>
  Number(seconds) > 0 ? new Date(Date.now() + Number(seconds) * 1000) : null;

export async function exchangeCode(
  code: string,
  appUrl: string,
): Promise<LongLivedToken & { permissions: string[] }> {
  const creds = instagramCredentials();
  if (!creds) throw new Error("INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET ausentes");

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: creds.appId,
      client_secret: creds.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(appUrl),
      // O Instagram às vezes devolve o código com "#_" no fim.
      code: code.replace(/#_$/, ""),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  // A resposta vem solta ou dentro de "data", conforme a versão.
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    permissions?: string | string[];
    data?: { access_token?: string; permissions?: string | string[] }[];
    error_message?: string;
    error?: { message?: string };
  };
  const short = json.data?.[0] ?? json;
  if (!res.ok || !short.access_token) {
    throw new Error(
      `troca do código: ${json.error_message ?? json.error?.message ?? res.status}`,
    );
  }
  const permissions = Array.isArray(short.permissions)
    ? short.permissions
    : String(short.permissions ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

  const long = await instagramApi<{
    access_token?: string;
    expires_in?: number;
  }>("access_token", {
    unversioned: true,
    query: {
      grant_type: "ig_exchange_token",
      client_secret: creds.appSecret,
      access_token: short.access_token,
    },
  });
  if (!long.access_token) throw new Error("token de 60 dias não veio");
  return {
    accessToken: long.access_token,
    expiresAt: expiry(long.expires_in),
    permissions,
  };
}

/** Renova o token de 60 dias (precisa ter pelo menos 24 horas e ainda não ter vencido). */
export async function refreshToken(token: string): Promise<LongLivedToken> {
  const res = await instagramApi<{
    access_token?: string;
    expires_in?: number;
  }>("refresh_access_token", {
    unversioned: true,
    query: { grant_type: "ig_refresh_token", access_token: token },
  });
  if (!res.access_token) throw new Error("token renovado não veio");
  return { accessToken: res.access_token, expiresAt: expiry(res.expires_in) };
}

/** A conta conectada: o id que vem nos avisos do webhook, o @ e o nome. */
export async function fetchAccount(token: string) {
  const me = await instagramApi<{
    user_id?: string | number;
    username?: string;
    name?: string;
  }>("me", { token, query: { fields: "user_id,username,name" } });
  const igUserId = String(me.user_id ?? "");
  if (!/^\d+$/.test(igUserId)) throw new Error("conta do Instagram sem id");
  return {
    igUserId,
    username: (me.username ?? "").slice(0, 60),
    name: (me.name ?? "").slice(0, 200),
  };
}

/**
 * Liga os avisos do webhook para esta conta: mensagens do Direct e, quando a permissão foi dada,
 * comentários.
 */
export async function subscribeWebhooks(token: string) {
  try {
    await instagramApi("me/subscribed_apps", {
      method: "POST",
      token,
      query: { subscribed_fields: "messages,comments" },
    });
  } catch {
    await instagramApi("me/subscribed_apps", {
      method: "POST",
      token,
      query: { subscribed_fields: "messages" },
    });
  }
}
