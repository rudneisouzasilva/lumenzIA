import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { sendTemplate, type Sender } from "./client";
import { graph, GraphError } from "./graph";
import {
  placeholderCount,
  TEMPLATE_PACK,
  type TemplatePurpose,
} from "./template-pack";

/**
 * Mensagens prontas (templates do WhatsApp)
 * -----------------------------------------
 * Cada template vive na conta do WhatsApp Business (WABA) da clínica. A LumenzIA guarda uma cópia
 * em public.message_templates com o status da Meta, que avisa as mudanças pelo webhook
 * (campo message_template_status_update).
 */

type Admin = SupabaseClient<Database>;
export type TemplateRow =
  Database["public"]["Tables"]["message_templates"]["Row"];

/** A Meta já tem um template com este nome e idioma nesta conta. */
const ALREADY_EXISTS_SUBCODE = 2388024;

type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejected_reason?: string;
  components?: { type: string; text?: string }[];
};

async function wabaAccess(admin: Admin, clinicId: string) {
  const [{ data: clinic }, { data: token }] = await Promise.all([
    admin
      .from("clinics")
      .select("whatsapp_waba_id")
      .eq("id", clinicId)
      .single()
      .throwOnError(),
    admin
      .rpc("get_clinic_secret", {
        p_clinic_id: clinicId,
        p_kind: "whatsapp_token",
      })
      .throwOnError(),
  ]);
  if (!clinic.whatsapp_waba_id || !token) return null;
  return { wabaId: clinic.whatsapp_waba_id, token };
}

/** Os componentes do template no formato da Meta, com os exemplos que ela exige. */
function components(row: Pick<TemplateRow, "body" | "footer" | "example">) {
  const examples = (Array.isArray(row.example) ? row.example : []).map(String);
  const count = placeholderCount(row.body);
  const body: Record<string, unknown> = { type: "BODY", text: row.body };
  if (count) {
    body.example = {
      body_text: [
        Array.from(
          { length: count },
          (_, i) => examples[i] || `exemplo ${i + 1}`,
        ),
      ],
    };
  }
  return [
    body,
    ...(row.footer.trim() ? [{ type: "FOOTER", text: row.footer.trim() }] : []),
  ];
}

async function listMetaTemplates(wabaId: string, token: string) {
  const all: MetaTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({
      fields: "id,name,language,status,category,rejected_reason,components",
      limit: "100",
      ...(after ? { after } : {}),
    });
    const res = await graph<{
      data?: MetaTemplate[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${encodeURIComponent(wabaId)}/message_templates?${query}`, { token });
    all.push(...(res.data ?? []));
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return all;
}

const errorText = (e: unknown) =>
  e instanceof GraphError
    ? e.message.slice(0, 300)
    : "Não foi possível falar com a Meta agora.";

/**
 * Envia (ou reenvia, depois de editar) um template para a aprovação da Meta e grava o status.
 * Devolve a mensagem de erro para mostrar na tela, ou null.
 */
export async function submitTemplate(row: TemplateRow): Promise<string | null> {
  const admin = createAdminClient();
  const access = await wabaAccess(admin, row.clinic_id);
  if (!access) return "Conecte o WhatsApp da clínica antes.";

  let result: { id?: string; status?: string; category?: string };
  try {
    result = row.meta_template_id
      ? {
          ...(await graph<{ success?: boolean }>(
            encodeURIComponent(row.meta_template_id),
            {
              method: "POST",
              token: access.token,
              body: { components: components(row) },
            },
          )),
          id: row.meta_template_id,
          status: "PENDING",
        }
      : await graph(`${encodeURIComponent(access.wabaId)}/message_templates`, {
          method: "POST",
          token: access.token,
          body: {
            name: row.name,
            language: row.language,
            category: row.category,
            components: components(row),
          },
        });
  } catch (e) {
    // Já existe na Meta com este nome (a clínica criou antes, ou um envio anterior se perdeu):
    // adota o que está lá.
    if (e instanceof GraphError && e.subcode === ALREADY_EXISTS_SUBCODE) {
      await syncTemplates(row.clinic_id);
      return null;
    }
    console.error(`[templates] enviar ${row.name}:`, (e as Error).message);
    const message = errorText(e);
    await admin
      .from("message_templates")
      .update({
        status: row.meta_template_id ? row.status : "ERRO",
        last_error: message,
      })
      .eq("id", row.id)
      .throwOnError();
    return `A Meta recusou o envio: ${message}`;
  }

  await admin
    .from("message_templates")
    .update({
      meta_template_id: result.id ?? row.meta_template_id,
      status: result.status ?? "PENDING",
      category: (result.category as TemplateRow["category"]) ?? row.category,
      rejected_reason: null,
      last_error: null,
    })
    .eq("id", row.id)
    .throwOnError();
  return null;
}

/**
 * Garante o pacote de mensagens prontas da LumenzIA na conta da clínica: cria o que falta, com o
 * nome da clínica nos exemplos, e envia para aprovação. Seguro para chamar de novo.
 */
export async function ensureTemplatePack(clinicId: string) {
  const admin = createAdminClient();
  const [{ data: clinic }, { data: existing }] = await Promise.all([
    admin
      .from("clinics")
      .select("name, assistant_name, template_language")
      .eq("id", clinicId)
      .single()
      .throwOnError(),
    admin
      .from("message_templates")
      .select("*")
      .eq("clinic_id", clinicId)
      .throwOnError(),
  ]);

  const errors: string[] = [];
  for (const item of TEMPLATE_PACK) {
    let row = existing.find((t) => t.purpose === item.purpose);
    if (!row) {
      const { data, error } = await admin
        .from("message_templates")
        .insert({
          clinic_id: clinicId,
          purpose: item.purpose,
          name: item.name,
          language: clinic.template_language || "pt_BR",
          category: item.category,
          body: item.body,
          footer: item.footer,
          example: item.example({
            clinic: clinic.name,
            assistant: clinic.assistant_name,
          }),
        })
        .select("*")
        .single();
      // Outro template com este nome já veio da Meta pelo "Sincronizar": passa a ter o propósito.
      if (error?.code === "23505") {
        const { data: adopted } = await admin
          .from("message_templates")
          .update({ purpose: item.purpose })
          .eq("clinic_id", clinicId)
          .eq("name", item.name)
          .eq("purpose", "outro")
          .select("*")
          .maybeSingle()
          .throwOnError();
        if (!adopted) continue;
        row = adopted;
      } else if (error) {
        throw new Error(error.message);
      } else {
        row = data;
      }
    }
    if (row.status === "RASCUNHO" || row.status === "ERRO") {
      const error = await submitTemplate(row);
      if (error) errors.push(`${item.title}: ${error}`);
    }
  }
  return errors;
}

/**
 * Traz da Meta os templates da conta da clínica: atualiza o status dos que já temos e adiciona os
 * que a clínica criou por conta própria (como "outro").
 */
export async function syncTemplates(clinicId: string) {
  const admin = createAdminClient();
  const access = await wabaAccess(admin, clinicId);
  if (!access) return "Conecte o WhatsApp da clínica antes.";

  let remote: MetaTemplate[];
  try {
    remote = await listMetaTemplates(access.wabaId, access.token);
  } catch (e) {
    console.error("[templates] sincronizar:", (e as Error).message);
    return `Não foi possível ler os templates na Meta: ${errorText(e)}`;
  }

  const { data: local } = await admin
    .from("message_templates")
    .select("id, name, language")
    .eq("clinic_id", clinicId)
    .throwOnError();

  for (const t of remote) {
    if (!/^[a-z0-9_]+$/.test(t.name) || t.status === "DELETED") continue;
    const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
    const footer = t.components?.find((c) => c.type === "FOOTER")?.text ?? "";
    const category = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(
      t.category,
    )
      ? (t.category as TemplateRow["category"])
      : "MARKETING";
    const values = {
      meta_template_id: t.id,
      status: t.status,
      category,
      rejected_reason:
        t.rejected_reason && t.rejected_reason !== "NONE"
          ? t.rejected_reason
          : null,
      ...(body ? { body: body.slice(0, 1024) } : {}),
      footer: footer.slice(0, 60),
    };
    const mine = local.find(
      (l) => l.name === t.name && l.language === t.language,
    );
    if (mine) {
      await admin
        .from("message_templates")
        .update(values)
        .eq("id", mine.id)
        .throwOnError();
    } else if (body) {
      await admin
        .from("message_templates")
        .insert({
          clinic_id: clinicId,
          name: t.name,
          language: t.language,
          body: body.slice(0, 1024),
          ...values,
        })
        .throwOnError();
    }
  }
  return null;
}

/** Aviso da Meta de que um template foi aprovado, recusado, pausado... */
export async function applyTemplateStatus(event: {
  templateId: string;
  status: string;
  reason: string | null;
}) {
  const admin = createAdminClient();
  await admin
    .from("message_templates")
    .update({
      status: event.status,
      rejected_reason:
        event.reason && event.reason !== "NONE" ? event.reason : null,
    })
    .eq("meta_template_id", event.templateId)
    .throwOnError();
}

/**
 * O template aprovado para um propósito. Sem o do pacote aprovado, usa o nome digitado pela equipe
 * LumenzIA no painel da equipe (clínicas configuradas antes das mensagens prontas).
 */
export async function templateFor(
  admin: Admin,
  clinicId: string,
  purpose: TemplatePurpose,
): Promise<{ name: string; language: string; body: string } | null> {
  const { data: row } = await admin
    .from("message_templates")
    .select("name, language, body, status")
    .eq("clinic_id", clinicId)
    .eq("purpose", purpose)
    .maybeSingle()
    .throwOnError();
  if (row?.status === "APPROVED") return row;

  if (purpose !== "lembrete" && purpose !== "aviso_equipe") return null;
  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "reminder_template_name, staff_alert_template_name, template_language",
    )
    .eq("id", clinicId)
    .single()
    .throwOnError();
  const legacy =
    purpose === "lembrete"
      ? clinic.reminder_template_name
      : clinic.staff_alert_template_name;
  return legacy
    ? { name: legacy, language: clinic.template_language, body: "" }
    : null;
}

/**
 * A Meta recusa variáveis com quebra de linha, tabulação ou mais de 4 espaços seguidos, e
 * vazias. Aqui elas viram uma linha só.
 */
export function cleanParam(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500) || "-";
}

/** O texto como o paciente vai ler, para guardar na conversa. */
export function renderTemplate(body: string, params: string[]) {
  return body.replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (_, n: string) => params[Number(n) - 1] ?? "",
  );
}

/** Envia um template e devolve o texto final (vazio se o texto não é conhecido). */
export async function sendTemplateMessage(
  sender: Sender,
  to: string,
  template: { name: string; language: string; body: string },
  params: string[],
) {
  const clean = params.map(cleanParam);
  await sendTemplate(sender, to, template.name, template.language, clean);
  return template.body ? renderTemplate(template.body, clean) : "";
}
