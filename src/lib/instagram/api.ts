import "server-only";

/**
 * Chamadas à API do Instagram (login do Instagram, graph.instagram.com), com o token de cada
 * clínica. Sem INSTAGRAM_API_VERSION, a Meta usa a versão mais antiga ainda disponível.
 */

const GRAPH = "https://graph.instagram.com";
// O Direct aceita até 1000 caracteres por mensagem: textos maiores vão em partes.
const MAX_TEXT = 1000;

export type InstagramSender = { igUserId: string; accessToken: string };

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
  }
}

function base() {
  const version = process.env.INSTAGRAM_API_VERSION?.trim();
  return version ? `${GRAPH}/${version}` : GRAPH;
}

export async function instagramApi<T>(
  path: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    query?: Record<string, string>;
    unversioned?: boolean;
  } = {},
): Promise<T> {
  const url = new URL(`${init.unversioned ? GRAPH : base()}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
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
    throw new InstagramError(
      json.error?.error_user_msg ??
        json.error?.message ??
        `Instagram API ${res.status}`,
      json.error?.code,
      json.error?.error_subcode,
    );
  }
  return json;
}

type SendResult = { recipient_id?: string; message_id?: string };

function send(
  sender: InstagramSender,
  recipient: { id: string } | { comment_id: string },
  message: Record<string, unknown>,
) {
  return instagramApi<SendResult>("me/messages", {
    method: "POST",
    token: sender.accessToken,
    body: { recipient, message },
  });
}

/** Quebra o texto em partes de até 1000 caracteres, de preferência entre parágrafos ou frases. */
export function splitText(text: string, max = MAX_TEXT) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const cut = Math.max(
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf(" "),
    );
    const at = cut > max / 2 ? cut + 1 : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Envia o texto pelo Direct (em partes, se precisar). Devolve os ids das mensagens enviadas. */
export async function sendInstagramText(
  sender: InstagramSender,
  to: string,
  text: string,
) {
  const ids: string[] = [];
  for (const part of splitText(text)) {
    const res = await send(sender, { id: to }, { text: part });
    if (res.message_id) ids.push(res.message_id);
  }
  return ids;
}

/** A foto precisa estar num endereço público: o Instagram baixa pelo link. */
export async function sendInstagramImage(
  sender: InstagramSender,
  to: string,
  url: string,
) {
  const res = await send(
    sender,
    { id: to },
    { attachment: { type: "image", payload: { url } } },
  );
  return res.message_id ?? null;
}

/**
 * Resposta no privado a um comentário: uma só por comentário, em até 7 dias. A pessoa recebe no
 * Direct e, se responder, a conversa continua normalmente.
 */
export async function sendPrivateReply(
  sender: InstagramSender,
  commentId: string,
  text: string,
) {
  const [first] = splitText(text);
  const res = await send(sender, { comment_id: commentId }, { text: first });
  return res.message_id ?? null;
}

/** O @ e o nome de quem escreveu (só funciona para quem já mandou mensagem para a clínica). */
export async function fetchProfile(sender: InstagramSender, igsid: string) {
  return instagramApi<{ username?: string; name?: string }>(
    encodeURIComponent(igsid),
    { token: sender.accessToken, query: { fields: "username,name" } },
  );
}
