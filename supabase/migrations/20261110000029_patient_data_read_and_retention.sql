-- =====================================================================
-- LumenzIA — dados de pacientes: quem da equipe pode ler, e por quanto tempo ficam guardados
--
-- 1. Leitura por área. Até aqui toda pessoa da equipe conseguia ler conversas, mensagens,
--    contatos, agendamentos e retomadas da clínica pela API do Supabase, mesmo sem a área
--    liberada (o painel só escondia). Agora o banco só mostra esses dados a quem trabalha com
--    pacientes:
--      - mensagens: Conversas, Funil ou Relatórios;
--      - conversas, contatos, agendamentos, retomadas e histórico do funil: essas três e também
--        Retomadas ou Agenda.
--    A dona e quem não tem lista de áreas (null) continuam vendo tudo; a equipe LumenzIA
--    (is_admin) também. O servidor (chave secreta) não passa por estas regras.
--
-- 2. Prazo de guarda: conversas encerradas cuja última mensagem tem mais de 2 anos são apagadas
--    na limpeza diária, com as mensagens delas. Os contatos (nome e telefone do funil) ficam.
--
-- Pode rodar de novo sem problema.
-- =====================================================================

-- A pessoa logada tem alguma destas áreas na clínica?
create or replace function public.member_can_any(p_clinic_id uuid, p_areas text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id
      and m.user_id = (select auth.uid())
      and (m.role = 'owner' or m.permissions is null or m.permissions && p_areas)
  );
$$;

revoke execute on function public.member_can_any(uuid, text[]) from public, anon;
grant execute on function public.member_can_any(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Leitura por área
-- ---------------------------------------------------------------------
drop policy if exists "membros veem as mensagens" on public.messages;
create policy "membros veem as mensagens" on public.messages
  for select to authenticated
  using (public.member_can_any(clinic_id, array['conversas', 'funil', 'relatorios'])
         or (select public.is_admin()));

drop policy if exists "membros veem as conversas" on public.conversations;
create policy "membros veem as conversas" on public.conversations
  for select to authenticated
  using (public.member_can_any(clinic_id,
           array['conversas', 'funil', 'relatorios', 'retomadas', 'agenda'])
         or (select public.is_admin()));

drop policy if exists "membros veem os contatos" on public.contacts;
create policy "membros veem os contatos" on public.contacts
  for select to authenticated
  using (public.member_can_any(clinic_id,
           array['conversas', 'funil', 'relatorios', 'retomadas', 'agenda'])
         or (select public.is_admin()));

drop policy if exists "membros veem os agendamentos" on public.appointments;
create policy "membros veem os agendamentos" on public.appointments
  for select to authenticated
  using (public.member_can_any(clinic_id,
           array['conversas', 'funil', 'relatorios', 'retomadas', 'agenda'])
         or (select public.is_admin()));

drop policy if exists "membros veem as retomadas" on public.follow_ups;
create policy "membros veem as retomadas" on public.follow_ups
  for select to authenticated
  using (public.member_can_any(clinic_id,
           array['conversas', 'funil', 'relatorios', 'retomadas', 'agenda'])
         or (select public.is_admin()));

drop policy if exists "membros veem o histórico do funil" on public.contact_stage_history;
create policy "membros veem o histórico do funil" on public.contact_stage_history
  for select to authenticated
  using (public.member_can_any(clinic_id,
           array['conversas', 'funil', 'relatorios', 'retomadas', 'agenda'])
         or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- 2. Limpeza diária com o prazo de 2 anos das conversas
-- ---------------------------------------------------------------------
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

  return jsonb_build_object('concluidos', v_completed, 'apagados', v_purged,
                            'auditoria', v_audit, 'registro', v_log,
                            'conversas_antigas', v_conversations);
end;
$$;

revoke execute on function public.run_daily_cleanup() from public, anon, authenticated;
grant execute on function public.run_daily_cleanup() to service_role;
