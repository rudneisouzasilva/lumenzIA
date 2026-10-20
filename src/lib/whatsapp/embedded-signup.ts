import "server-only";

import { randomInt } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Conectar WhatsApp" (Cadastro Incorporado da Meta, modelo Tech Provider)
 * -----------------------------------------------------------------------
 * A LumenzIA tem UM app na Meta e UM webhook. Cada clínica entra com a conta dela no Facebook
 * numa janela da Meta, escolhe (ou cria) a conta do WhatsApp Business e o número, e a janela
 * devolve para o navegador:
 *  - um `code` de uso único (pelo FB.login), que só o servidor troca por um token, com o App Secret;
 *  - o `waba_id` e o `phone_number_id` escolhidos (por postMessage).
 *
 * Aqui o servidor confere que o número pertence mesmo àquela conta, inscreve o app nos avisos da
 * conta (é isso que faz as mensagens chegarem no nosso webhook), registra o número na Cloud API e
 * guarda o token no Vault da clínica.
 */

const GRAPH = "https://graph.facebook.com";

export function graphVersion() {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
}

/** O que o navegador precisa para abrir a janela da Meta (nada disso é segredo). */
export function embeddedSignupConfig() {
  const appId = process.env.META_APP_ID?.trim();
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  if (!appId || !configId || !process.env.META_APP_SECRET?.trim()) return null;
  return { appId, configId, graphVersion: graphVersion() };
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

async function graph<T>(
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
    error?: { message?: string; code?: number };
  } & T;
  if (!res.ok || json.error) {
    throw new GraphError(
      json.error?.message ?? `Graph API ${res.status}`,
      json.error?.code,
    );
  }
  return json;
}

/** Troca o `code` do FB.login pelo token da integração (não expira). */
async function exchangeCode(code: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!.trim(),
    client_secret: process.env.META_APP_SECRET!.trim(),
    code,
  });
  const { access_token } = await graph<{ access_token?: string }>(
    `oauth/access_token?${params}`,
  );
  if (!access_token) throw new GraphError("A Meta não devolveu o token.");
  return access_token;
}

type PhoneNumber = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
};

export type ConnectInput = {
  clinicId: string;
  userId: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  /** Número que já usa o app WhatsApp Business no celular (coexistência): não pode ser registrado. */
  coexistence: boolean;
};

export type ConnectResult =
  | {
      ok: true;
      displayPhone: string | null;
      verifiedName: string | null;
      warning?: string;
    }
  | { ok: false; error: string };

export async function connectWhatsapp(
  input: ConnectInput,
): Promise<ConnectResult> {
  const admin = createAdminClient();

  // Um número só atende uma clínica (whatsapp_phone_number_id é único).
  const { data: other } = await admin
    .from("clinics")
    .select("id")
    .eq("whatsapp_phone_number_id", input.phoneNumberId)
    .neq("id", input.clinicId)
    .maybeSingle()
    .throwOnError();
  if (other) {
    return {
      ok: false,
      error:
        "Este número já está conectado a outra clínica na LumenzIA. Fale com o suporte.",
    };
  }

  let token: string;
  let phone: PhoneNumber | undefined;
  try {
    token = await exchangeCode(input.code);
    // Confere com o próprio token que o número pertence à conta escolhida.
    const { data: numbers } = await graph<{ data?: PhoneNumber[] }>(
      `${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
      { token },
    );
    phone = numbers?.find((n) => n.id === input.phoneNumberId);
    if (!phone) {
      return {
        ok: false,
        error:
          "O número escolhido não pertence à conta do WhatsApp Business conectada.",
      };
    }
    // Sem esta inscrição, as mensagens dos pacientes não chegam ao nosso webhook.
    await graph(`${encodeURIComponent(input.wabaId)}/subscribed_apps`, {
      method: "POST",
      token,
    });
  } catch (e) {
    console.error("[whatsapp] cadastro incorporado:", (e as Error).message);
    return {
      ok: false,
      error:
        "A Meta recusou a conexão. Tente de novo; se continuar, fale com o suporte.",
    };
  }

  // Registrar o número na Cloud API define o PIN da verificação em duas etapas. Um número que já
  // estava registrado (ou com outro PIN) devolve erro aqui: a conexão continua valendo e a equipe
  // resolve pelo painel da Meta, por isso vira só um aviso.
  let warning: string | undefined;
  let pin: string | null = null;
  if (!input.coexistence) {
    const candidate = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await graph(`${encodeURIComponent(input.phoneNumberId)}/register`, {
        method: "POST",
        token,
        body: { messaging_product: "whatsapp", pin: candidate },
      });
      pin = candidate;
    } catch (e) {
      console.error("[whatsapp] registro do número:", (e as Error).message);
      warning =
        "O número foi conectado, mas a Meta não confirmou o registro na Cloud API. A equipe LumenzIA vai conferir.";
    }
  }

  await admin
    .rpc("set_clinic_secret", {
      p_clinic_id: input.clinicId,
      p_kind: "whatsapp_token",
      p_value: token,
    })
    .throwOnError();
  if (pin) {
    await admin
      .rpc("set_clinic_secret", {
        p_clinic_id: input.clinicId,
        p_kind: "whatsapp_pin",
        p_value: pin,
      })
      .throwOnError();
  }
  const { error } = await admin
    .from("clinics")
    .update({
      whatsapp_phone_number_id: input.phoneNumberId,
      whatsapp_waba_id: input.wabaId,
      whatsapp_display_phone: phone.display_phone_number ?? null,
      whatsapp_verified_name: phone.verified_name ?? null,
      whatsapp_connected_at: new Date().toISOString(),
      whatsapp_coexistence: input.coexistence,
      whatsapp_history_status: input.coexistence
        ? "aguardando"
        : "nao_solicitado",
      whatsapp_history_progress: 0,
      whatsapp_history_messages: 0,
    })
    .eq("id", input.clinicId);
  if (error?.code === "23505") {
    return {
      ok: false,
      error:
        "Este número já está conectado a outra clínica na LumenzIA. Fale com o suporte.",
    };
  }
  if (error) throw new Error(error.message);

  // Coexistência: pede à Meta os contatos e o histórico do app (só vale nas primeiras 24 horas).
  if (
    input.coexistence &&
    !(await requestAppSync(input.phoneNumberId, token))
  ) {
    await admin
      .from("clinics")
      .update({ whatsapp_history_status: "erro" })
      .eq("id", input.clinicId);
    warning ??=
      "O número foi conectado, mas a Meta não liberou o histórico do celular agora. Tente de novo na tela do WhatsApp.";
  }

  await admin.from("admin_audit_log").insert({
    admin_id: input.userId,
    clinic_id: input.clinicId,
    action: "whatsapp.conectado",
    details: `Conectado pela clínica (Cadastro Incorporado): número ${phone.display_phone_number ?? input.phoneNumberId}, WABA ${input.wabaId}${input.coexistence ? ", coexistência com o app" : ""}${warning ? "; registro na Cloud API pendente" : ""}.`,
  });

  return {
    ok: true,
    displayPhone: phone.display_phone_number ?? null,
    verifiedName: phone.verified_name ?? null,
    warning,
  };
}

/**
 * Pede à Meta, na coexistência, a sincronização dos contatos do app e depois do histórico de
 * conversas. Os dados chegam pelo webhook (campos smb_app_state_sync e history). A Meta só aceita
 * nas primeiras 24 horas depois da conexão.
 */
async function requestAppSync(phoneNumberId: string, token: string) {
  try {
    for (const syncType of ["smb_app_state_sync", "history"]) {
      await graph(`${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
        method: "POST",
        token,
        body: { messaging_product: "whatsapp", sync_type: syncType },
      });
    }
    return true;
  } catch (e) {
    console.error("[whatsapp] sincronizar o app:", (e as Error).message);
    return false;
  }
}

/** Janela que a Meta dá para pedir o histórico do app depois da conexão. */
export const HISTORY_SYNC_WINDOW_MS = 24 * 3600_000;

/** O botão "pedir de novo" aparece só depois de uma falha, dentro da janela da Meta. */
export function historyRetryAllowed(
  status: string,
  connectedAt: string | null,
  now = Date.now(),
) {
  return (
    status === "erro" &&
    Boolean(connectedAt) &&
    now - Date.parse(connectedAt!) < HISTORY_SYNC_WINDOW_MS
  );
}

/** Tenta de novo pedir o histórico do celular (botão na tela do WhatsApp). */
export async function retryHistorySync(clinicId: string) {
  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "whatsapp_phone_number_id, whatsapp_coexistence, whatsapp_connected_at",
    )
    .eq("id", clinicId)
    .single()
    .throwOnError();
  if (!clinic.whatsapp_phone_number_id || !clinic.whatsapp_coexistence) {
    return "O histórico só existe para números que continuam no app WhatsApp Business.";
  }
  if (
    !clinic.whatsapp_connected_at ||
    Date.now() - Date.parse(clinic.whatsapp_connected_at) >
      HISTORY_SYNC_WINDOW_MS
  ) {
    return "A Meta só libera o histórico nas primeiras 24 horas depois da conexão.";
  }
  const { data: token } = await admin.rpc("get_clinic_secret", {
    p_clinic_id: clinicId,
    p_kind: "whatsapp_token",
  });
  if (!token) return "O WhatsApp da clínica não está conectado.";
  if (!(await requestAppSync(clinic.whatsapp_phone_number_id, token))) {
    return "A Meta recusou o pedido agora. Tente de novo em alguns minutos.";
  }
  await admin
    .from("clinics")
    .update({ whatsapp_history_status: "aguardando" })
    .eq("id", clinicId)
    .throwOnError();
  return null;
}

/**
 * Desliga o WhatsApp da clínica: para de receber avisos daquela conta, apaga o token e o PIN e
 * pausa a assistente. A conta e o número continuam da clínica, na Meta.
 */
export async function disconnectWhatsapp(
  clinicId: string,
  actor: { userId: string; reason: string },
) {
  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "whatsapp_waba_id, whatsapp_display_phone, whatsapp_phone_number_id",
    )
    .eq("id", clinicId)
    .single()
    .throwOnError();

  const { data: token } = await admin.rpc("get_clinic_secret", {
    p_clinic_id: clinicId,
    p_kind: "whatsapp_token",
  });
  if (clinic.whatsapp_waba_id && token) {
    try {
      await graph(
        `${encodeURIComponent(clinic.whatsapp_waba_id)}/subscribed_apps`,
        {
          method: "DELETE",
          token,
        },
      );
    } catch (e) {
      // Sem acesso à conta (a clínica já removeu a LumenzIA na Meta): segue desligando aqui.
      console.error("[whatsapp] cancelar inscrição:", (e as Error).message);
    }
  }

  await clearWhatsapp(clinicId);
  await admin.from("admin_audit_log").insert({
    admin_id: actor.userId,
    clinic_id: clinicId,
    action: "whatsapp.desconectado",
    details: `${actor.reason}: número ${clinic.whatsapp_display_phone ?? clinic.whatsapp_phone_number_id ?? "—"}.`,
  });
}

async function clearWhatsapp(clinicId: string) {
  const admin = createAdminClient();
  await admin
    .from("clinics")
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_waba_id: null,
      whatsapp_display_phone: null,
      whatsapp_verified_name: null,
      whatsapp_connected_at: null,
      whatsapp_coexistence: false,
      whatsapp_history_status: "nao_solicitado",
      whatsapp_history_progress: 0,
      is_active: false,
    })
    .eq("id", clinicId)
    .throwOnError();
  for (const kind of ["whatsapp_token", "whatsapp_pin"]) {
    await admin
      .rpc("set_clinic_secret", {
        p_clinic_id: clinicId,
        p_kind: kind,
        p_value: "",
      })
      .throwOnError();
  }
}

/**
 * Aviso da Meta de que a clínica removeu a LumenzIA da conta do WhatsApp Business (campo
 * "account_update", evento PARTNER_REMOVED): o token deixou de valer, então desliga aqui também.
 */
export async function handlePartnerRemoved(wabaId: string) {
  const admin = createAdminClient();
  const { data: clinics } = await admin
    .from("clinics")
    .select("id, whatsapp_display_phone")
    .eq("whatsapp_waba_id", wabaId)
    .throwOnError();
  for (const clinic of clinics) {
    await clearWhatsapp(clinic.id);
    await admin.from("admin_audit_log").insert({
      clinic_id: clinic.id,
      action: "whatsapp.removido_na_meta",
      details: `A clínica removeu a LumenzIA da conta ${wabaId} na Meta; número ${clinic.whatsapp_display_phone ?? "—"} desligado.`,
    });
  }
}
