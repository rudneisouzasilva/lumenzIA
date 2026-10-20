import "server-only";

/** Chamadas à Graph API da Meta (WhatsApp Business), com o token de cada clínica. */

const GRAPH = "https://graph.facebook.com";

export function graphVersion() {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
  }
}

export async function graph<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${GRAPH}/${graphVersion()}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: {
      message?: string;
      code?: number;
      error_subcode?: number;
      error_user_msg?: string;
    };
  } & T;
  if (!res.ok || json.error) {
    throw new GraphError(
      json.error?.error_user_msg ??
        json.error?.message ??
        `Graph API ${res.status}`,
      json.error?.code,
      json.error?.error_subcode,
    );
  }
  return json;
}
