-- =====================================================================
-- LGPD: apagar os dados de um paciente e não guardar contatos para sempre
-- =====================================================================
-- 1. delete_patient_data: a dona da clínica apaga um paciente pelo painel (Funil). Some o
--    contato (com CPF, nascimento e campos próprios em patient_data), todas as conversas e
--    mensagens dele, os agendamentos guardados aqui, as retomadas e o histórico do funil.
--    O registro de agendamentos para análise (appointment_log) não tem nome nem telefone e só
--    perde o vínculo (on delete set null). Agendamentos no sistema da clínica (Google Agenda,
--    Clínica Experts) não são tocados: lá a clínica apaga no próprio sistema.
-- 2. run_daily_cleanup também apaga contatos sem nenhuma conversa nem agendamento há 2 anos,
--    o mesmo prazo das conversas.

create or replace function public.delete_patient_data(p_clinic_id uuid, p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact       public.contacts%rowtype;
  v_conversations integer;
  v_appointments  integer;
begin
  select * into v_contact
    from public.contacts
   where id = p_contact_id and clinic_id = p_clinic_id
   for update;
  if not found then
    return null;
  end if;

  -- Conversas ligadas ao contato e as do mesmo telefone/Instagram que ainda não foram ligadas.
  -- As mensagens vão junto (on delete cascade).
  delete from public.conversations
   where clinic_id = p_clinic_id
     and (contact_id = p_contact_id
          or (v_contact.phone is not null and contact_phone = v_contact.phone)
          or (v_contact.instagram_id is not null and contact_phone = v_contact.instagram_id));
  get diagnostics v_conversations = row_count;

  delete from public.appointments
   where clinic_id = p_clinic_id
     and (contact_id = p_contact_id
          or (v_contact.phone is not null and contact_phone = v_contact.phone));
  get diagnostics v_appointments = row_count;

  -- Retomadas e histórico do funil vão junto (on delete cascade).
  delete from public.contacts where id = p_contact_id;

  return jsonb_build_object('conversas', v_conversations, 'agendamentos', v_appointments);
end;
$$;

revoke execute on function public.delete_patient_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_patient_data(uuid, uuid) to service_role;

create or replace function public.run_daily_cleanup()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_completed     integer;
  v_purged        integer;
  v_audit         integer;
  v_log           integer;
  v_conversations integer;
  v_contacts      integer;
begin
  update public.appointments set status = 'concluido'
   where status = 'agendado' and starts_at <= now();
  get diagnostics v_completed = row_count;

  delete from public.appointments
   where status in ('concluido', 'cancelado') and starts_at <= now() - interval '30 days';
  get diagnostics v_purged = row_count;

  delete from public.admin_audit_log where created_at <= now() - interval '365 days';
  get diagnostics v_audit = row_count;

  delete from public.appointment_log where starts_at <= now() - interval '13 months';
  get diagnostics v_log = row_count;

  -- As mensagens vão junto (on delete cascade).
  delete from public.conversations
   where status <> 'aberta' and last_message_at <= now() - interval '2 years';
  get diagnostics v_conversations = row_count;

  -- Contatos parados há 2 anos (com os dados do paciente), se não sobrou conversa nem
  -- agendamento deles. Retomadas e histórico do funil vão junto (on delete cascade).
  delete from public.contacts ct
   where ct.last_contact_at <= now() - interval '2 years'
     and not exists (select 1 from public.conversations c where c.contact_id = ct.id)
     and not exists (select 1 from public.appointments a where a.contact_id = ct.id);
  get diagnostics v_contacts = row_count;

  return jsonb_build_object('concluidos', v_completed, 'apagados', v_purged,
                            'auditoria', v_audit, 'registro', v_log,
                            'conversas_antigas', v_conversations,
                            'contatos_antigos', v_contacts);
end;
$$;

revoke execute on function public.run_daily_cleanup() from public, anon, authenticated;
grant execute on function public.run_daily_cleanup() to service_role;
