-- =====================================================================
-- Regras de acesso (Row Level Security + permissões por coluna)
--
-- Regra geral: uma pessoa só enxerga e altera linhas das clínicas das quais é membro; a equipe
-- LumenzIA (profiles.is_admin) enxerga todas. Tudo o que é técnico ou sensível (pagamentos,
-- WhatsApp, agenda, mensagens enviadas) é escrito só pelo servidor, com a chave service_role,
-- que ignora o RLS. Por isso o navegador recebe permissão de escrita apenas nas colunas de
-- conteúdo que a própria clínica configura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares usadas nas políticas
-- (security definer para não depender do RLS das próprias tabelas consultadas)
-- ---------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;

create function public.is_clinic_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id and m.user_id = (select auth.uid())
  );
$$;

-- Duas pessoas trabalham na mesma clínica? (para mostrar o nome de quem atendeu)
create function public.shares_clinic_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members mine
    join public.clinic_members theirs on theirs.clinic_id = mine.clinic_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_clinic_member(uuid) from public, anon;
revoke execute on function public.shares_clinic_with(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_clinic_member(uuid) to authenticated, service_role;
grant execute on function public.shares_clinic_with(uuid) to authenticated, service_role;

-- Funções de gatilho não devem ser chamáveis pela API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_clinic() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS ligado em todas as tabelas
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.clinic_secrets enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.faqs enable row level security;
alter table public.ai_questions enable row level security;
alter table public.contact_reasons enable row level security;
alter table public.services enable row level security;
alter table public.professionals enable row level security;
alter table public.images enable row level security;
alter table public.integrations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;
alter table public.admin_audit_log enable row level security;

-- ---------------------------------------------------------------------
-- Permissões por tabela/coluna (o Supabase concede tudo por padrão; aqui fechamos e reabrimos
-- só o necessário)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.plans to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

grant select on public.clinics to authenticated;
grant update (
  name, assistant_name, tone, business_info, past_conversations, behavior_rules, is_active,
  conversation_timeout_hours, work_days, work_hours_start, work_hours_end, works_on_holidays,
  extra_closed_dates
) on public.clinics to authenticated;

grant select on public.clinic_members to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.payments to authenticated;

grant select, insert, update, delete on public.faqs to authenticated;
grant select, insert, update, delete on public.ai_questions to authenticated;
grant select, insert, update, delete on public.contact_reasons to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.professionals to authenticated;
grant select, insert, update, delete on public.images to authenticated;

grant select on public.integrations to authenticated;
grant update (reminder_hours_before) on public.integrations to authenticated;

grant select on public.conversations to authenticated;
grant update (attendance_state, needs_human_at) on public.conversations to authenticated;

grant select on public.messages to authenticated;
grant select on public.appointments to authenticated;
grant select on public.admin_audit_log to authenticated;
-- public.clinic_secrets: nenhuma permissão para anon/authenticated.

-- ---------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------
create policy "planos ativos são públicos" on public.plans
  for select to anon, authenticated using (active);
create policy "admins veem todos os planos" on public.plans
  for select to authenticated using ((select public.is_admin()));

create policy "ver o próprio perfil, colegas de clínica ou tudo (admin)" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_clinic_with(id) or (select public.is_admin()));
create policy "editar o próprio perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "membros veem a clínica" on public.clinics
  for select to authenticated using (public.is_clinic_member(id) or (select public.is_admin()));
create policy "membros editam o conteúdo da clínica" on public.clinics
  for update to authenticated
  using (public.is_clinic_member(id)) with check (public.is_clinic_member(id));

create policy "membros veem a equipe da clínica" on public.clinic_members
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

create policy "membros veem a assinatura" on public.subscriptions
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

create policy "membros veem os pagamentos" on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.subscriptions s
    where s.id = subscription_id and (public.is_clinic_member(s.clinic_id) or (select public.is_admin()))
  ));

-- Conteúdo da assistente: membros leem e escrevem tudo da própria clínica
create policy "membros gerenciam faqs" on public.faqs
  for all to authenticated
  using (public.is_clinic_member(clinic_id) or (select public.is_admin()))
  with check (public.is_clinic_member(clinic_id));
create policy "membros gerenciam perguntas da IA" on public.ai_questions
  for all to authenticated
  using (public.is_clinic_member(clinic_id) or (select public.is_admin()))
  with check (public.is_clinic_member(clinic_id));
create policy "membros gerenciam motivos de contato" on public.contact_reasons
  for all to authenticated
  using (public.is_clinic_member(clinic_id) or (select public.is_admin()))
  with check (public.is_clinic_member(clinic_id));
create policy "membros gerenciam procedimentos" on public.services
  for all to authenticated
  using (public.is_clinic_member(clinic_id) or (select public.is_admin()))
  with check (public.is_clinic_member(clinic_id));
create policy "membros gerenciam profissionais" on public.professionals
  for all to authenticated
  using (public.is_clinic_member(clinic_id) or (select public.is_admin()))
  with check (public.is_clinic_member(clinic_id));
create policy "membros gerenciam fotos" on public.images
  for all to authenticated
  using (public.is_clinic_member(clinic_id) or (select public.is_admin()))
  with check (public.is_clinic_member(clinic_id) and storage_path like clinic_id::text || '/%');

create policy "membros veem a integração" on public.integrations
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
create policy "membros escolhem o lembrete" on public.integrations
  for update to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

create policy "membros veem as conversas" on public.conversations
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
create policy "membros assumem ou devolvem conversas" on public.conversations
  for update to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

create policy "membros veem as mensagens" on public.messages
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

create policy "membros veem os agendamentos" on public.appointments
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

create policy "admins veem a auditoria" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));
