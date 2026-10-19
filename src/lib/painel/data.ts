import "server-only";

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
