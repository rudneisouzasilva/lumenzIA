import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Google Agenda pelas contas da própria clínica (OAuth)
 * ----------------------------------------------------
 * A clínica autoriza a LumenzIA uma vez por conta do Google; guardamos o refresh token no Vault e
 * trocamos por um token de acesso de 1 hora quando precisamos. Escopos: ler a lista de agendas,
 * ver horários ocupados e criar/apagar eventos.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 15_000;

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Troca o código do OAuth pelos tokens e descobre o e-mail da conta. */
export async function exchangeCode(code: string, redirectUri: string) {
  const creds = googleCredentials();
  if (!creds) throw new GoogleError("GOOGLE_CLIENT_ID não configurado", 500);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new GoogleError(
      `troca do código: ${data.error ?? res.status}`,
      res.status,
    );
  }
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const user = (await info.json().catch(() => ({}))) as { email?: string };
  if (!user.email) throw new GoogleError("e-mail da conta não veio", 400);
  return {
    email: user.email.toLowerCase(),
    refreshToken: data.refresh_token ?? null,
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    // Na tela do Google a pessoa pode desmarcar permissões: sem estas, a agenda não funciona.
    allGranted: GOOGLE_SCOPES.filter((s) => s.startsWith("https://")).every(
      (s) => (data.scope ?? "").split(" ").includes(s),
    ),
  };
}

const tokens = new Map<string, { token: string; expiresAt: number }>();

export function cacheAccessToken(
  accountId: string,
  token: string,
  seconds: number,
) {
  tokens.set(accountId, { token, expiresAt: Date.now() + seconds * 1000 });
}

/** Token de acesso de uma conta conectada. A conta revogada fica marcada como desconectada. */
async function accessToken(accountId: string) {
  const cached = tokens.get(accountId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const creds = googleCredentials();
  if (!creds) throw new GoogleError("GOOGLE_CLIENT_ID não configurado", 500);
  const admin = createAdminClient();
  const { data: refresh } = await admin
    .rpc("get_google_refresh_token", { p_account_id: accountId })
    .throwOnError();
  if (!refresh) throw new GoogleError("conta do Google sem autorização", 401);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      await admin
        .from("google_accounts")
        .update({
          status: "desconectado",
          last_error:
            "A autorização foi retirada no Google. Conecte a conta de novo.",
        })
        .eq("id", accountId);
    }
    throw new GoogleError(`renovar token: ${data.error ?? res.status}`, 401);
  }
  cacheAccessToken(accountId, data.access_token, data.expires_in ?? 3600);
  return data.access_token;
}

/** Chamada à API do Google Agenda em nome de uma conta. */
export async function calendarApi<T>(
  accountId: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): Promise<T> {
  const token = await accessToken(accountId);
  const query = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`${API}/${path}${query}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 204) return {} as T;
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      message =
        (JSON.parse(text) as { error?: { message?: string } }).error?.message ??
        message;
    } catch {}
    throw new GoogleError(message, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type GoogleCalendar = { id: string; name: string; primary: boolean };

/** As agendas em que a conta pode criar eventos. */
export async function listCalendars(
  accountId: string,
): Promise<GoogleCalendar[]> {
  const res = await calendarApi<{
    items?: {
      id: string;
      summary?: string;
      summaryOverride?: string;
      primary?: boolean;
    }[];
  }>(accountId, "users/me/calendarList", {
    query: { minAccessRole: "writer", maxResults: "250" },
  });
  return (res.items ?? []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    primary: Boolean(c.primary),
  }));
}

/** Revoga a autorização no Google (ao desconectar a conta). Falhar aqui não impede desconectar. */
export async function revokeAccount(accountId: string) {
  const admin = createAdminClient();
  const { data: refresh } = await admin.rpc("get_google_refresh_token", {
    p_account_id: accountId,
  });
  tokens.delete(accountId);
  if (!refresh) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refresh }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined);
}
