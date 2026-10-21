-- =====================================================================
-- LumenzIA — canais dos avisos à equipe e dos lembretes (WhatsApp e e-mail)
--
-- Avisos à equipe (paciente pedindo atendimento humano, cota do plano acabou): a própria clínica
-- escolhe os canais e cadastra o contato, na tela "Avisos e lembretes" do painel.
--   clinics.staff_alert_channels: algum de {whatsapp, email}
--   clinics.staff_phone_number:   WhatsApp da equipe (já existia; agora a clínica edita)
--   clinics.staff_alert_email:    e-mail da equipe
--
-- Lembretes de agendamento: o WhatsApp continua sendo sempre usado; a clínica pode mandar também
-- por e-mail, que só vale quando o e-mail é pedido no agendamento (clinics.booking_fields).
--   clinics.reminder_by_email
-- =====================================================================

alter table public.clinics
  add column staff_alert_channels text[] not null default '{whatsapp}'
    check (staff_alert_channels <@ array['whatsapp', 'email']::text[]),
  add column staff_alert_email text
    check (staff_alert_email is null or (
      length(staff_alert_email) <= 254 and staff_alert_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )),
  add column reminder_by_email boolean not null default false;

grant update (staff_phone_number, staff_alert_channels, staff_alert_email, reminder_by_email)
  on public.clinics to authenticated;

-- ---------------------------------------------------------------------
-- Lembretes: agora também com o e-mail informado no agendamento (ou no contato)
-- ---------------------------------------------------------------------
drop function public.due_reminders();

create function public.due_reminders()
returns table (
  id             bigint,
  clinic_id      uuid,
  contact_phone  text,
  patient_name   text,
  procedure_name text,
  starts_at      timestamptz,
  external_ref   text,
  patient_email  text
)
language sql
stable
set search_path = ''
as $$
  select ap.id, ap.clinic_id, ap.contact_phone, ap.patient_name, ap.procedure_name, ap.starts_at,
         ap.external_ref,
         nullif(coalesce(ap.patient_data ->> 'email', c.patient_data ->> 'email'), '')
    from public.appointments ap
    join public.integrations i on i.clinic_id = ap.clinic_id
    left join public.contacts c on c.id = ap.contact_id
   where ap.status = 'agendado'
     and ap.reminder_sent_at is null
     and i.enabled
     and i.reminder_hours_before > 0
     and ap.starts_at between now() and now() + make_interval(hours => i.reminder_hours_before)
   order by ap.starts_at
   limit 500;
$$;

revoke execute on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;
