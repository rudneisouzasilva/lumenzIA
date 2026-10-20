-- =====================================================================
-- LumenzIA — fase 2, etapa 4: retomada automática das conversas
--
-- Uma retomada é uma mensagem pronta enviada a um contato numa data:
--  - "cliente": a própria pessoa pediu ("pode me chamar em novembro"), registrado pela IA na
--    conversa ou percebido na classificação ao encerrar;
--  - "padrao": o prazo que a clínica escolheu para quem não agendou (abandonadas e/ou concluídas
--    sem agendamento, cada uma com os seus dias);
--  - "manual": criada pela equipe no painel.
-- A data pedida pela pessoa sempre vence o padrão. A retomada é cancelada sozinha se a pessoa
-- escrever antes, agendar ou pedir para não receber mais mensagens.
-- =====================================================================

alter table public.clinics
  add column followup_abandoned_days smallint check (followup_abandoned_days between 1 and 90), -- null = não retomar
  add column followup_concluded_days smallint check (followup_concluded_days between 1 and 90), -- concluídas sem agendamento
  add column followup_max_attempts   smallint not null default 1 check (followup_max_attempts between 1 and 3);

grant update (followup_abandoned_days, followup_concluded_days, followup_max_attempts)
  on public.clinics to authenticated;

create table public.follow_ups (
  id                   bigint generated always as identity primary key,
  clinic_id            uuid not null references public.clinics (id) on delete cascade,
  contact_id           uuid not null references public.contacts (id) on delete cascade,
  conversation_id      bigint references public.conversations (id) on delete set null, -- de onde veio
  due_at               timestamptz not null,
  source               text not null check (source in ('cliente', 'padrao', 'manual')),
  reason               text not null default '' check (char_length(reason) <= 120), -- assunto
  note                 text not null default '' check (char_length(note) <= 500),
  attempt              smallint not null default 1 check (attempt between 1 and 3),
  -- pendente → enviado → respondido (a pessoa escreveu depois do envio); ou cancelado / falhou
  status               text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'respondido', 'cancelado', 'falhou')),
  sent_at              timestamptz,
  responded_at         timestamptz,
  sent_conversation_id bigint references public.conversations (id) on delete set null,
  cancel_reason        text, -- contato_voltou | agendou | descadastro | equipe
  failures             smallint not null default 0,
  last_error           text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- No máximo uma retomada pendente por contato.
create unique index follow_ups_one_pending_idx on public.follow_ups (contact_id) where status = 'pendente';
create index follow_ups_due_idx on public.follow_ups (due_at) where status = 'pendente';
create index follow_ups_clinic_idx on public.follow_ups (clinic_id, created_at desc);
create index follow_ups_contact_sent_idx on public.follow_ups (contact_id, sent_at desc) where status = 'enviado';

create trigger follow_ups_set_updated_at before update on public.follow_ups
  for each row execute function public.set_updated_at();

-- A retomada que abriu esta conversa (a mensagem pronta é a primeira mensagem dela).
alter table public.conversations
  add column follow_up_id bigint references public.follow_ups (id) on delete set null;

-- ---------------------------------------------------------------------
-- Cancelamentos e respostas automáticos
-- ---------------------------------------------------------------------
-- Mensagem nova do paciente (no fluxo normal do WhatsApp):
--  - uma retomada enviada nos últimos 30 dias passa a "respondido";
--  - uma pendente marcada em OUTRA conversa é cancelada (a pessoa voltou antes). A pendente
--    marcada nesta mesma conversa fica: é a que ela acabou de combinar.
create function public.follow_up_on_patient_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
begin
  if new.role <> 'user' or new.origin <> 'whatsapp' then
    return null;
  end if;
  select contact_id into v_contact from public.conversations where id = new.conversation_id;
  if v_contact is null then
    return null;
  end if;

  update public.follow_ups
     set status = 'respondido', responded_at = new.created_at
   where contact_id = v_contact and status = 'enviado'
     and sent_at >= new.created_at - interval '30 days' and sent_at <= new.created_at;

  update public.follow_ups
     set status = 'cancelado', cancel_reason = 'contato_voltou'
   where contact_id = v_contact and status = 'pendente'
     and conversation_id is distinct from new.conversation_id;
  return null;
end;
$$;

create trigger messages_follow_up after insert on public.messages
  for each row execute function public.follow_up_on_patient_message();

-- Agendou: não precisa retomar.
create function public.follow_up_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is not null and new.status = 'agendado' and new.starts_at > now() then
    update public.follow_ups
       set status = 'cancelado', cancel_reason = 'agendou'
     where contact_id = new.contact_id and status = 'pendente';
  end if;
  return null;
end;
$$;

create trigger appointments_follow_up after insert on public.appointments
  for each row execute function public.follow_up_on_appointment();

-- Pediu para não receber mais mensagens.
create function public.follow_up_on_opt_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.opted_out_at is not null and old.opted_out_at is null then
    update public.follow_ups
       set status = 'cancelado', cancel_reason = 'descadastro'
     where contact_id = new.id and status = 'pendente';
  end if;
  return null;
end;
$$;

create trigger contacts_follow_up_opt_out after update of opted_out_at on public.contacts
  for each row execute function public.follow_up_on_opt_out();

-- ---------------------------------------------------------------------
-- Para o job (só o servidor)
-- ---------------------------------------------------------------------
-- Retomadas cuja data chegou, das clínicas com a assistente ligada. O horário de envio (dentro
-- do expediente da clínica) é conferido no servidor.
create function public.due_follow_ups(p_limit integer)
returns table (
  id              bigint,
  clinic_id       uuid,
  contact_id      uuid,
  conversation_id bigint,
  source          text,
  reason          text,
  attempt         smallint,
  failures        smallint,
  phone           text,
  contact_name    text,
  opted_out_at    timestamptz
)
language sql
stable
set search_path = ''
as $$
  select f.id, f.clinic_id, f.contact_id, f.conversation_id, f.source, f.reason, f.attempt,
         f.failures, ct.phone, coalesce(nullif(ct.name, ''), ct.whatsapp_name), ct.opted_out_at
    from public.follow_ups f
    join public.contacts ct on ct.id = f.contact_id
    join public.clinics cl on cl.id = f.clinic_id
   where f.status = 'pendente'
     and f.due_at <= now()
     and cl.is_active
   order by f.due_at
   limit p_limit;
$$;

revoke execute on function public.due_follow_ups(integer) from public, anon, authenticated;
grant execute on function public.due_follow_ups(integer) to service_role;
revoke execute on function public.follow_up_on_patient_message() from public, anon, authenticated;
revoke execute on function public.follow_up_on_appointment() from public, anon, authenticated;
revoke execute on function public.follow_up_on_opt_out() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Acesso: o painel só lê; criar, mudar a data e cancelar passam pelo servidor
-- ---------------------------------------------------------------------
alter table public.follow_ups enable row level security;
revoke all on public.follow_ups from anon, authenticated;
grant select on public.follow_ups to authenticated;

create policy "membros veem as retomadas" on public.follow_ups
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- Job: a cada 15 minutos (o envio só sai no horário da clínica)
-- ---------------------------------------------------------------------
select cron.schedule('lumenzia-retomadas', '*/15 * * * *',
  $$select public.invoke_cron_route('/api/cron/retomadas')$$);
