-- =====================================================================
-- LumenzIA — fase 2, etapa 1: contatos e registro de agendamentos para análise
--
-- 1. public.contacts: uma linha por pessoa que fala com a clínica (clínica + telefone). Até aqui
--    tudo era ligado só pelo telefone; o funil, a retomada e os indicadores precisam de um
--    registro único. Conversas e agendamentos ganham contact_id, preenchido sozinho por gatilho.
-- 2. public.appointment_log: os dados básicos de cada agendamento (sem nome nem telefone do
--    paciente), guardados por 13 meses para os indicadores e a análise da IA. Os agendamentos
--    completos continuam sendo apagados 30 dias depois, como antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Contatos
-- ---------------------------------------------------------------------
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  phone            text not null check (phone ~ '^\d{8,15}$'),
  name             text not null default '' check (char_length(name) <= 120), -- nome que a equipe ou a agenda informou
  whatsapp_name    text not null default '' check (char_length(whatsapp_name) <= 120), -- nome do perfil no WhatsApp
  first_contact_at timestamptz not null default now(),
  last_contact_at  timestamptz not null default now(),
  opted_out_at     timestamptz, -- pediu para não receber mais mensagens da clínica
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (clinic_id, phone)
);

create index contacts_clinic_last_idx on public.contacts (clinic_id, last_contact_at desc);

create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.conversations
  add column contact_id uuid references public.contacts (id) on delete set null;
create index conversations_contact_idx on public.conversations (contact_id, started_at desc);

-- source: 'ia' = marcado pela assistente; 'agenda' = trazido da agenda da clínica
alter table public.appointments
  add column contact_id      uuid references public.contacts (id) on delete set null,
  add column conversation_id bigint references public.conversations (id) on delete set null,
  add column source          text not null default 'agenda' check (source in ('ia', 'agenda'));
create index appointments_contact_idx on public.appointments (contact_id, starts_at desc);

-- O contato da clínica com este telefone, criado na primeira vez. O nome só é gravado se o
-- contato ainda não tiver um (o que a equipe digitou nunca é sobrescrito).
create function public.ensure_contact(p_clinic_id uuid, p_phone text, p_name text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name  text := left(trim(coalesce(p_name, '')), 120);
  v_id    uuid;
begin
  if v_phone !~ '^\d{8,15}$' then
    return null;
  end if;

  insert into public.contacts (clinic_id, phone, name)
  values (p_clinic_id, v_phone, v_name)
  on conflict (clinic_id, phone) do update
    set name = case when public.contacts.name = '' then excluded.name else public.contacts.name end
  returning id into v_id;
  return v_id;
end;
$$;

-- Toda conversa nova fica ligada ao contato (criado aqui, se for a primeira).
create function public.conversation_link_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is null then
    new.contact_id := public.ensure_contact(new.clinic_id, new.contact_phone);
  end if;
  return new;
end;
$$;

create trigger conversations_link_contact before insert on public.conversations
  for each row execute function public.conversation_link_contact();

-- "Último contato" acompanha a última mensagem de qualquer conversa da pessoa.
create function public.conversation_touch_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is not null then
    update public.contacts
       set last_contact_at = greatest(last_contact_at, new.last_message_at),
           first_contact_at = least(first_contact_at, new.started_at)
     where id = new.contact_id;
  end if;
  return null;
end;
$$;

create trigger conversations_touch_contact
  after insert or update of last_message_at, contact_id on public.conversations
  for each row execute function public.conversation_touch_contact();

create function public.appointment_link_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is null then
    new.contact_id := public.ensure_contact(new.clinic_id, new.contact_phone, new.patient_name);
  end if;
  return new;
end;
$$;

create trigger appointments_link_contact before insert on public.appointments
  for each row execute function public.appointment_link_contact();

-- ---------------------------------------------------------------------
-- 2. Registro de agendamentos para análise (13 meses, sem dados pessoais)
-- ---------------------------------------------------------------------
create table public.appointment_log (
  id                bigint generated always as identity primary key,
  clinic_id         uuid not null references public.clinics (id) on delete cascade,
  appointment_id    bigint unique references public.appointments (id) on delete set null,
  contact_id        uuid references public.contacts (id) on delete set null,
  conversation_id   bigint references public.conversations (id) on delete set null,
  source            text not null check (source in ('ia', 'agenda')),
  procedure_name    text not null default '',
  professional_name text not null default '',
  starts_at         timestamptz not null,
  status            public.appointment_status not null,
  booked_at         timestamptz not null,
  updated_at        timestamptz not null default now()
);

create index appointment_log_clinic_booked_idx on public.appointment_log (clinic_id, booked_at desc);
create index appointment_log_contact_idx on public.appointment_log (contact_id, booked_at);

-- Cada agendamento criado ou alterado atualiza o registro. Apagar o agendamento (limpeza de 30
-- dias) mantém a linha do registro, só sem o vínculo.
create function public.appointment_to_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.appointment_log (
    clinic_id, appointment_id, contact_id, conversation_id, source, procedure_name,
    professional_name, starts_at, status, booked_at
  ) values (
    new.clinic_id, new.id, new.contact_id, new.conversation_id, new.source, new.procedure_name,
    new.professional_name, new.starts_at, new.status, new.created_at
  )
  on conflict (appointment_id) do update set
    contact_id        = excluded.contact_id,
    conversation_id   = excluded.conversation_id,
    procedure_name    = excluded.procedure_name,
    professional_name = excluded.professional_name,
    starts_at         = excluded.starts_at,
    status            = excluded.status,
    updated_at        = now();
  return null;
end;
$$;

create trigger appointments_to_log
  after insert or update of status, starts_at, procedure_name, professional_name, contact_id, conversation_id
  on public.appointments
  for each row execute function public.appointment_to_log();

-- ---------------------------------------------------------------------
-- 3. Dados que já existiam
-- ---------------------------------------------------------------------
insert into public.contacts (clinic_id, phone, first_contact_at, last_contact_at)
select clinic_id, contact_phone, min(started_at), max(last_message_at)
  from public.conversations
 where contact_phone ~ '^\d{8,15}$'
 group by clinic_id, contact_phone
on conflict (clinic_id, phone) do nothing;

insert into public.contacts (clinic_id, phone, name, first_contact_at, last_contact_at)
select clinic_id, contact_phone, left(max(patient_name), 120), min(created_at), max(created_at)
  from public.appointments
 where contact_phone ~ '^\d{8,15}$'
 group by clinic_id, contact_phone
on conflict (clinic_id, phone) do update
  set name = case when public.contacts.name = '' then excluded.name else public.contacts.name end;

update public.conversations c
   set contact_id = ct.id
  from public.contacts ct
 where ct.clinic_id = c.clinic_id and ct.phone = c.contact_phone and c.contact_id is null;

update public.appointments a
   set contact_id = ct.id
  from public.contacts ct
 where ct.clinic_id = a.clinic_id and ct.phone = a.contact_phone and a.contact_id is null;

-- O update acima já passou pelo gatilho; este cobre os agendamentos que ficaram sem contato.
insert into public.appointment_log (
  clinic_id, appointment_id, contact_id, conversation_id, source, procedure_name,
  professional_name, starts_at, status, booked_at
)
select a.clinic_id, a.id, a.contact_id, a.conversation_id, a.source, a.procedure_name,
       a.professional_name, a.starts_at, a.status, a.created_at
  from public.appointments a
on conflict (appointment_id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Limpeza diária: o registro guarda 13 meses
-- ---------------------------------------------------------------------
create or replace function public.run_daily_cleanup()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_completed integer;
  v_purged    integer;
  v_audit     integer;
  v_log       integer;
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

  return jsonb_build_object('concluidos', v_completed, 'apagados', v_purged,
                            'auditoria', v_audit, 'registro', v_log);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Acesso
-- ---------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.appointment_log enable row level security;

revoke all on public.contacts, public.appointment_log from anon, authenticated;
grant select on public.contacts to authenticated;
grant update (name, opted_out_at) on public.contacts to authenticated;
grant select on public.appointment_log to authenticated;

create policy "membros veem os contatos" on public.contacts
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
create policy "membros editam os contatos" on public.contacts
  for update to authenticated
  using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));

create policy "membros veem o registro de agendamentos" on public.appointment_log
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

revoke execute on function public.ensure_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ensure_contact(uuid, text, text) to service_role;
revoke execute on function public.conversation_link_contact() from public, anon, authenticated;
revoke execute on function public.conversation_touch_contact() from public, anon, authenticated;
revoke execute on function public.appointment_link_contact() from public, anon, authenticated;
revoke execute on function public.appointment_to_log() from public, anon, authenticated;
revoke execute on function public.run_daily_cleanup() from public, anon, authenticated;
grant execute on function public.run_daily_cleanup() to service_role;

-- ---------------------------------------------------------------------
-- 6. Caixa de entrada com o nome do contato (o tipo de retorno mudou: drop + create)
-- ---------------------------------------------------------------------
drop function public.attendance_inbox(uuid);

create function public.attendance_inbox(p_clinic_id uuid)
returns table (
  id                      bigint,
  contact_phone           text,
  contact_id              uuid,
  contact_name            text,
  attendance_state        public.attendance_state,
  needs_human_at          timestamptz,
  started_at              timestamptz,
  last_message_at         timestamptz,
  message_count           bigint,
  last_message            text,
  last_role               public.message_role,
  last_patient_message_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.contact_phone, c.contact_id,
         coalesce(nullif(ct.name, ''), nullif(ct.whatsapp_name, '')),
         c.attendance_state, c.needs_human_at, c.started_at,
         c.last_message_at, coalesce(stats.total, 0), last.content, last.role, stats.last_patient_at
    from public.conversations c
    left join public.contacts ct on ct.id = c.contact_id
    left join lateral (
      select m.content, m.role
        from public.messages m
       where m.conversation_id = c.id
       order by m.id desc
       limit 1
    ) last on true
    left join lateral (
      select count(*) as total,
             max(m.created_at) filter (where m.role = 'user') as last_patient_at
        from public.messages m
       where m.conversation_id = c.id
    ) stats on true
   where c.clinic_id = p_clinic_id
     and c.status = 'aberta'
   order by case c.attendance_state when 'pendente' then 0 when 'equipe' then 1 else 2 end,
            c.last_message_at desc
   limit 200;
$$;

revoke execute on function public.attendance_inbox(uuid) from public, anon;
grant execute on function public.attendance_inbox(uuid) to authenticated, service_role;
