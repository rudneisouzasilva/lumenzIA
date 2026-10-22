import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API do Clínica Experts
 * ----------------------
 * A clínica gera a chave no Clínica Experts (Configurações > Integrações) e cola no painel. Cada
 * chamada vai com "Authorization: Bearer <chave>". Limite: cerca de 100 chamadas por minuto.
 * Documentação: https://clinicaexperts.readme.io/reference/introduction
 */

const API = "https://api.clinicaexperts.com.br/api/v1";
const TIMEOUT_MS = 15_000;

export class ClinicaExpertsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Options = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

/** Chama a API com a chave informada. Lança ClinicaExpertsError quando a resposta não é 2xx. */
export async function ceRequest<T>(
  apiKey: string,
  path: string,
  { method = "GET", query, body }: Options = {},
): Promise<T> {
  const url = new URL(`${API}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    // 422 traz os campos recusados em "errors": vai inteiro para o log.
    throw new ClinicaExpertsError(
      `${method} ${url.pathname} respondeu ${res.status}: ${text.slice(0, 500)}`,
      res.status,
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ClinicaExpertsError(
      `${method} ${url.pathname} não respondeu em JSON`,
      502,
    );
  }
}

/** A chave guardada da clínica, ou null se não está conectada. */
export async function clinicKey(clinicId: string) {
  const { data } = await createAdminClient()
    .rpc("get_clinica_experts_key", { p_clinic_id: clinicId })
    .throwOnError();
  return data || null;
}

/** Chama a API com a chave da clínica. */
export async function ceApi<T>(clinicId: string, path: string, opts?: Options) {
  const key = await clinicKey(clinicId);
  if (!key) throw new ClinicaExpertsError("Clínica Experts não conectado", 401);
  return ceRequest<T>(key, path, opts);
}

export type CeProfessional = { uuid: string; name: string };

type ProfessionalResource = {
  uuid?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  active?: boolean | null;
};

/** Os profissionais ativos da clínica no Clínica Experts. Serve também para testar a chave. */
export async function listCeProfessionals(apiKey: string) {
  const res = await ceRequest<{ data?: ProfessionalResource[] }>(
    apiKey,
    "professionals",
    { query: { per_page: 1000 } },
  );
  return (res.data ?? [])
    .filter((p) => p.uuid && p.active !== false)
    .map((p) => ({
      uuid: String(p.uuid),
      name:
        p.name?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        "Sem nome",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
