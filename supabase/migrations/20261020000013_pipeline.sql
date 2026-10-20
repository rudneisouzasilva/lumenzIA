-- =====================================================================
-- LumenzIA — fase 2, etapa 5: funil comercial (um por clínica)
--
-- Cada contato está numa etapa do funil da clínica. As etapas são da clínica (nome, cor, ordem),
-- e algumas têm uma regra automática:
--   novo_contato  quando o contato aparece pela primeira vez;
--   em_conversa   quando a clínica responde (assistente ou equipe);
--   agendou       quando um agendamento é criado;
--   compareceu    quando o agendamento é marcado como concluído.
-- A mudança automática só anda para frente (nunca desfaz o que a equipe fez), com uma exceção:
-- quem estava em uma etapa "perdido" e volta a conversar ou agenda é reativado.
-- Toda mudança de etapa fica em contact_stage_history (para os indicadores de conversão).
-- =====================================================================

create table public.pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null default 'slate'
    check (color in ('slate', 'blue', 'violet', 'amber', 'emerald', 'teal', 'rose', 'orange')),
  sort_order integer not null default 0,
  -- aberto: ainda em negociação; ganho: agendou/compareceu; perdido: desistiu
  kind       text not null default 'aberto' check (kind in ('aberto', 'ganho', 'perdido')),
  auto_rule  text check (auto_rule in ('novo_contato', 'em_conversa', 'agendou', 'compareceu')),
  created_at timestamptz not null default now()
);

create index pipeline_stages_clinic_idx on public.pipeline_stages (clinic_id, sort_order);
-- Cada regra automática aponta para no máximo uma etapa da clínica.
create unique index pipeline_stages_rule_idx on public.pipeline_stages (clinic_id, auto_rule)
  where auto_rule is not null;

create table public.lost_reasons (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index lost_reasons_clinic_idx on public.lost_reasons (clinic_id, sort_order);

alter table public.contacts
  add column stage_id              uuid references public.pipeline_stages (id) on delete set null,
  add column stage_changed_at      timestamptz,
  add column owner_id              uuid references public.profiles (id) on delete set null,
  add column estimated_value_cents integer check (estimated_value_cents between 0 and 100000000),
  add column notes                 text not null default '' check (char_length(notes) <= 2000),
  add column lost_reason_id        uuid references public.lost_reasons (id) on delete set null;

create index contacts_stage_idx on public.contacts (clinic_id, stage_id, last_contact_at desc);

create table public.contact_stage_history (
  id            bigint generated always as identity primary key,
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  contact_id    uuid not null references public.contacts (id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages (id) on delete set null,
  to_stage_id   uuid references public.pipeline_stages (id) on delete set null,
  automatic     boolean not null default false,
  changed_by    uuid references public.profiles (id) on delete set null,
  changed_at    timestamptz not null default now()
);

create index contact_stage_history_clinic_idx on public.contact_stage_history (clinic_id, changed_at);
create index contact_stage_history_contact_idx on public.contact_stage_history (contact_id, changed_at);

-- ---------------------------------------------------------------------
-- Funil padrão de cada clínica
-- ---------------------------------------------------------------------
create function public.seed_pipeline(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.pipeline_stages where clinic_id = p_clinic_id) then
    return;
  end if;
  insert into public.pipeline_stages (clinic_id, name, color, sort_order, kind, auto_rule) values
    (p_clinic_id, 'Novo contato', 'blue',    10, 'aberto',  'novo_contato'),
    (p_clinic_id, 'Em conversa',  'violet',  20, 'aberto',  'em_conversa'),
    (p_clinic_id, 'Interessado',  'amber',   30, 'aberto',  null),
    (p_clinic_id, 'Agendado',     'emerald', 40, 'ganho',   'agendou'),
    (p_clinic_id, 'Compareceu',   'teal',    50, 'ganho',   'compareceu'),
    (p_clinic_id, 'Perdido',      'rose',    60, 'perdido', null);
  insert into public.lost_reasons (clinic_id, name, sort_order) values
    (p_clinic_id, 'Preço', 10),
    (p_clinic_id, 'Nenhum horário serviu', 20),
    (p_clinic_id, 'Escolheu outra clínica', 30),
    (p_clinic_id, 'Só estava pesquisando', 40),
    (p_clinic_id, 'Parou de responder', 50),
    (p_clinic_id, 'Outro motivo', 60);
end;
$$;

create or replace function public.handle_new_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.integrations (clinic_id) values (new.id);
  insert into public.clinic_secrets (clinic_id) values (new.id);
  perform public.seed_pipeline(new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Mudança de etapa: confere a clínica, carimba a data e registra o histórico
-- ---------------------------------------------------------------------
create function public.contact_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  if new.stage_id is not null then
    select kind into v_kind from public.pipeline_stages
     where id = new.stage_id and clinic_id = new.clinic_id;
    if v_kind is null then
      raise exception 'etapa de outra clínica' using errcode = '23503';
    end if;
  end if;
  new.stage_changed_at := now();
  -- O motivo da perda só vale enquanto o contato estiver numa etapa "perdido".
  if v_kind is distinct from 'perdido' then
    new.lost_reason_id := null;
  end if;
  if tg_op = 'UPDATE' then
    insert into public.contact_stage_history
      (clinic_id, contact_id, from_stage_id, to_stage_id, automatic, changed_by)
    values (
      new.clinic_id, new.id, old.stage_id, new.stage_id,
      coalesce(current_setting('lumenzia.auto_stage', true), '') = '1',
      case when coalesce(current_setting('lumenzia.auto_stage', true), '') = '1'
           then null else auth.uid() end
    );
  end if;
  return new;
end;
$$;

create trigger contacts_stage_changed before update of stage_id on public.contacts
  for each row execute function public.contact_stage_changed();

-- Contato novo entra na etapa "novo contato" da clínica.
create function public.contact_initial_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage_id is null then
    select id into new.stage_id from public.pipeline_stages
     where clinic_id = new.clinic_id and auto_rule = 'novo_contato';
    if new.stage_id is not null then
      new.stage_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger contacts_initial_stage before insert on public.contacts
  for each row execute function public.contact_initial_stage();

-- Aplica uma regra automática: só avança, ou reativa quem estava perdido.
create function public.apply_stage_rule(p_contact_id uuid, p_rule text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
  v_target  public.pipeline_stages%rowtype;
  v_current public.pipeline_stages%rowtype;
begin
  select * into v_contact from public.contacts where id = p_contact_id;
  if not found then
    return;
  end if;
  select * into v_target from public.pipeline_stages
   where clinic_id = v_contact.clinic_id and auto_rule = p_rule;
  if not found or v_target.id = v_contact.stage_id then
    return;
  end if;
  if v_contact.stage_id is not null then
    select * into v_current from public.pipeline_stages where id = v_contact.stage_id;
    if found and v_current.kind <> 'perdido' and v_current.sort_order >= v_target.sort_order then
      return;
    end if;
  end if;

  perform set_config('lumenzia.auto_stage', '1', true);
  update public.contacts set stage_id = v_target.id where id = p_contact_id;
  perform set_config('lumenzia.auto_stage', '', true);
end;
$$;

-- A clínica respondeu (assistente, painel ou celular) ou um contato perdido voltou a escrever.
create function public.stage_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
begin
  if new.origin not in ('whatsapp', 'painel', 'celular') then
    return null;
  end if;
  select contact_id into v_contact from public.conversations where id = new.conversation_id;
  if v_contact is null then
    return null;
  end if;
  if new.role in ('model', 'staff') then
    perform public.apply_stage_rule(v_contact, 'em_conversa');
  elsif exists (
    select 1 from public.contacts c join public.pipeline_stages s on s.id = c.stage_id
     where c.id = v_contact and s.kind = 'perdido'
  ) then
    perform public.apply_stage_rule(v_contact, 'em_conversa');
  end if;
  return null;
end;
$$;

create trigger messages_stage after insert on public.messages
  for each row execute function public.stage_on_message();

create function public.stage_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is null then
    return null;
  end if;
  if new.status = 'concluido' and (tg_op = 'INSERT' or old.status is distinct from 'concluido') then
    perform public.apply_stage_rule(new.contact_id, 'compareceu');
  elsif new.status = 'agendado' and tg_op = 'INSERT' then
    perform public.apply_stage_rule(new.contact_id, 'agendou');
  end if;
  return null;
end;
$$;

create trigger appointments_stage after insert or update of status on public.appointments
  for each row execute function public.stage_on_appointment();

-- ---------------------------------------------------------------------
-- Clínicas e contatos que já existem
-- ---------------------------------------------------------------------
select public.seed_pipeline(id) from public.clinics;

update public.contacts c
   set stage_id = s.id, stage_changed_at = now()
  from public.pipeline_stages s
 where s.clinic_id = c.clinic_id
   and c.stage_id is null
   and s.auto_rule = case
     when exists (select 1 from public.appointment_log l
                   where l.contact_id = c.id and l.status = 'concluido') then 'compareceu'
     when exists (select 1 from public.appointment_log l
                   where l.contact_id = c.id and l.status <> 'cancelado') then 'agendou'
     when exists (select 1 from public.conversations v
                   join public.messages m on m.conversation_id = v.id
                  where v.contact_id = c.id and m.role in ('model', 'staff')) then 'em_conversa'
     else 'novo_contato'
   end;
-- A carga inicial não é uma mudança de etapa (o histórico começa vazio).
delete from public.contact_stage_history;

revoke execute on function public.seed_pipeline(uuid) from public, anon, authenticated;
revoke execute on function public.apply_stage_rule(uuid, text) from public, anon, authenticated;
revoke execute on function public.contact_stage_changed() from public, anon, authenticated;
revoke execute on function public.contact_initial_stage() from public, anon, authenticated;
revoke execute on function public.stage_on_message() from public, anon, authenticated;
revoke execute on function public.stage_on_appointment() from public, anon, authenticated;
grant execute on function public.seed_pipeline(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Acesso: a equipe da clínica edita o próprio funil e os dados comerciais dos contatos
-- ---------------------------------------------------------------------
alter table public.pipeline_stages enable row level security;
alter table public.lost_reasons enable row level security;
alter table public.contact_stage_history enable row level security;

revoke all on public.pipeline_stages, public.lost_reasons, public.contact_stage_history
  from anon, authenticated;
grant select, delete on public.pipeline_stages, public.lost_reasons to authenticated;
grant insert (clinic_id, name, color, sort_order, kind),
      update (name, color, sort_order, kind) on public.pipeline_stages to authenticated;
grant insert (clinic_id, name, sort_order), update (name, sort_order)
  on public.lost_reasons to authenticated;
grant select on public.contact_stage_history to authenticated;
grant update (stage_id, owner_id, estimated_value_cents, notes, lost_reason_id)
  on public.contacts to authenticated;

create policy "membros veem o funil" on public.pipeline_stages
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
create policy "membros criam etapas" on public.pipeline_stages
  for insert to authenticated with check (public.is_clinic_member(clinic_id));
create policy "membros alteram etapas" on public.pipeline_stages
  for update to authenticated using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));
create policy "membros apagam etapas" on public.pipeline_stages
  for delete to authenticated using (public.is_clinic_member(clinic_id));

create policy "membros veem os motivos de perda" on public.lost_reasons
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
create policy "membros criam motivos de perda" on public.lost_reasons
  for insert to authenticated with check (public.is_clinic_member(clinic_id));
create policy "membros alteram motivos de perda" on public.lost_reasons
  for update to authenticated using (public.is_clinic_member(clinic_id))
  with check (public.is_clinic_member(clinic_id));
create policy "membros apagam motivos de perda" on public.lost_reasons
  for delete to authenticated using (public.is_clinic_member(clinic_id));

create policy "membros veem o histórico do funil" on public.contact_stage_history
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

