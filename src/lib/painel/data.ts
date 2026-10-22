import "server-only";

import { publicImageUrl } from "@/lib/storage";
import type { TemplatePurpose } from "@/lib/whatsapp/template-pack";

import { getPanelContext } from "./context";
import { LIST_COLUMNS, type ListItem, type ListKind } from "./validation";

/** Itens de uma lista da clínica, na ordem definida pela própria clínica. */
export async function getListItems(kind: ListKind): Promise<ListItem[]> {
  const { supabase, clinic } = await getPanelContext();
  const { data, error } = await supabase
    .from(kind as "faqs")
    .select(LIST_COLUMNS[kind])
    .eq("clinic_id", clinic.id)
    .order("sort_order")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ListItem[];
}

/** Dados da clínica que as telas de configuração usam. */
export async function getClinicSettings() {
  const { supabase, clinic } = await getPanelContext();
  const { data, error } = await supabase
    .from("clinics")
    .select(
      "name, assistant_name, tone, business_info, past_conversations, behavior_rules, is_active, conversation_timeout_hours, work_days, work_hours_start, work_hours_end, works_on_holidays, extra_closed_dates, whatsapp_phone_number_id",
    )
    .eq("id", clinic.id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Horários no formato do formulário ("08:00", sem segundos). */
export async function getHours() {
  const { supabase, clinic } = await getPanelContext();
  const [settings, { data: integration }] = await Promise.all([
    getClinicSettings(),
    supabase
      .from("integrations")
      .select("reminder_hours_before")
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
  ]);
  return {
    workDays: settings.work_days,
    start: settings.work_hours_start?.slice(0, 5) ?? "",
    end: settings.work_hours_end?.slice(0, 5) ?? "",
    worksOnHolidays: settings.works_on_holidays,
    extraClosedDates: settings.extra_closed_dates,
    reminderHoursBefore: integration?.reminder_hours_before ?? 0,
  };
}

/** O que a caixa de entrada precisa (a tela Conversas e a janela flutuante do chat). */
export async function getInboxData() {
  const [{ supabase, clinic }, settings] = await Promise.all([
    getPanelContext(),
    getClinicSettings(),
  ]);
  const [{ data: images }, { data: templates }, { data: instagram }] =
    await Promise.all([
      supabase
        .from("images")
        .select("id, storage_path, description")
        .eq("clinic_id", clinic.id)
        .order("created_at"),
      supabase
        .from("message_templates")
        .select("id, purpose, name, body")
        .eq("clinic_id", clinic.id)
        .eq("status", "APPROVED")
        .neq("category", "AUTHENTICATION")
        .neq("purpose", "aviso_equipe")
        .order("created_at"),
      supabase
        .from("instagram_accounts")
        .select("status")
        .eq("clinic_id", clinic.id)
        .maybeSingle(),
    ]);
  return {
    clinicId: clinic.id,
    whatsappConnected: Boolean(settings.whatsapp_phone_number_id),
    instagramConnected: instagram?.status === "ativo",
    images: (images ?? []).map((img) => ({
      id: img.id,
      url: publicImageUrl(img.storage_path),
      description: img.description,
    })),
    templates: (templates ?? []).map((t) => ({
      ...t,
      purpose: t.purpose as TemplatePurpose,
    })),
    clinic: { name: settings.name, assistantName: settings.assistant_name },
  };
}
