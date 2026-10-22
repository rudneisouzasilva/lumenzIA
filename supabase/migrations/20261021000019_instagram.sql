-- =====================================================================
-- LumenzIA — Instagram: a assistente também responde o Direct da clínica
--
-- A clínica conecta a conta profissional do Instagram (login do Instagram, sem Página do
-- Facebook). As mensagens do Direct entram como conversas do canal "instagram", com a mesma IA,
-- a mesma caixa de entrada e o mesmo funil. Opcionalmente, um comentário num post vira uma
-- resposta no privado.
--
-- Diferenças do WhatsApp:
--  - quem escreve é identificado pelo id do Instagram (conversations.contact_phone guarda esse id
--    nas conversas do Instagram), não pelo telefone;
--  - não existem mensagens prontas: fora das 24 horas a clínica não consegue escrever;
--  - o contato pode não ter telefone. Ele ganha um quando informa o WhatsApp ao agendar, e aí
--    lembretes e retomadas saem pelo WhatsApp normalmente.
--
-- messages.origin continua igual: 'whatsapp' é o fluxo normal (paciente e IA) de qualquer canal, e
-- 'celular' é a equipe respondendo pelo app do celular (WhatsApp Business ou Instagram).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Canal da conversa
-- ---------------------------------------------------------------------
alter table public.conversations
  add column channel text not null default 'whatsapp' check (channel in ('whatsapp', 'instagram'));

-- ---------------------------------------------------------------------
-- 2. Contatos do Instagram (podem não ter telefone)
-- ---------------------------------------------------------------------
alter table public.contacts
  alter column phone drop not null,
  add column instagram_id       text check (instagram_id ~ '^\d{1,30}$'),
  add column instagram_username text not null default '' check (char_length(instagram_username) <= 60),
  add constraint contacts_clinic_instagram_key unique (clinic_id, instagram_id),
  add constraint contacts_has_channel check (phone is not null or instagram_id is not null);

-- O contato da clínica com este id do Instagram, criado na primeira vez. O @ é atualizado quando
-- vem (a pessoa pode trocar de usuário).
create function public.ensure_instagram_contact(p_clinic_id uuid, p_instagram_id text, p_username text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       text := trim(coalesce(p_instagram_id, ''));
  v_username text := left(trim(coalesce(p_username, '')), 60);
  v_contact  uuid;
begin
  if v_id !~ '^\d{1,30}$' then
    return null;
  end if;

  insert into public.contacts (clinic_id, instagram_id, instagram_username)
  values (p_clinic_id, v_id, v_username)
  on conflict (clinic_id, instagram_id) do update
    set instagram_username = case when excluded.instagram_username = '' then public.contacts.instagram_username
                                  else excluded.instagram_username end
  returning id into v_contact;
  return v_contact;
end;
$$;

-- Toda conversa nova fica ligada ao contato do seu canal.
create or replace function public.conversation_link_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is null then
    if new.channel = 'instagram' then
      new.contact_id := public.ensure_instagram_contact(new.clinic_id, new.contact_phone);
    else
      new.contact_id := public.ensure_contact(new.clinic_id, new.contact_phone);
    end if;
  end if;
  return new;
end;
$$;

-- A pessoa do Instagram informou o WhatsApp ao agendar: o contato fica com o telefone, se nenhum
-- outro contato da clínica já tiver esse número (aí o agendamento fica com o contato do WhatsApp).
create function public.link_instagram_phone(p_contact_id uuid, p_phone text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_clinic uuid;
begin
  if v_phone !~ '^\d{8,15}$' then
    return false;
  end if;
  select clinic_id into v_clinic from public.contacts
   where id = p_contact_id and phone is null;
  if not found or exists (
    select 1 from public.contacts where clinic_id = v_clinic and phone = v_phone
  ) then
    return false;
  end if;
  update public.contacts set phone = v_phone where id = p_contact_id and phone is null;
  return true;
end;
$$;

revoke execute on function public.ensure_instagram_contact(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.link_instagram_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_instagram_contact(uuid, text, text) to service_role;
grant execute on function public.link_instagram_phone(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 3. A conta do Instagram de cada clínica (o token fica no Vault)
-- ---------------------------------------------------------------------
create table public.instagram_accounts (
  clinic_id          uuid primary key references public.clinics (id) on delete cascade,
  ig_user_id         text not null unique, -- o id que a Meta manda nos avisos do webhook
  username           text not null default '' check (char_length(username) <= 60),
  name               text not null default '' check (char_length(name) <= 200),
  token_secret_id    uuid,
  token_expires_at   timestamptz,          -- o token vale 60 dias e é renovado pelo job diário
  token_refreshed_at timestamptz not null default now(),
  reply_comments     boolean not null default false, -- comentário nos posts vira resposta no privado
  status             text not null default 'ativo' check (status in ('ativo', 'desconectado')),
  last_error         text,
  connected_by       uuid references public.profiles (id) on delete set null,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger instagram_accounts_set_updated_at before update on public.instagram_accounts
  for each row execute function public.set_updated_at();

create function public.set_instagram_token(p_clinic_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := 'instagram:' || p_clinic_id;
begin
  select token_secret_id into v_secret_id
    from public.instagram_accounts where clinic_id = p_clinic_id;
  if not found then
    raise exception 'conta do Instagram não encontrada: %', p_clinic_id;
  end if;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_token, v_name);
    update public.instagram_accounts set token_secret_id = v_secret_id where clinic_id = p_clinic_id;
  else
    perform vault.update_secret(v_secret_id, p_token, v_name);
  end if;
end;
$$;

create function public.get_instagram_token(p_clinic_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
    from public.instagram_accounts a
    join vault.decrypted_secrets d on d.id = a.token_secret_id
   where a.clinic_id = p_clinic_id;
$$;

create function public.delete_instagram_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.token_secret_id is not null then
    delete from vault.secrets where id = old.token_secret_id;
  end if;
  return old;
end;
$$;

create trigger instagram_accounts_vault_cleanup after delete on public.instagram_accounts
  for each row execute function public.delete_instagram_vault_secret();

revoke execute on function public.set_instagram_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_instagram_token(uuid) from public, anon, authenticated;
revoke execute on function public.delete_instagram_vault_secret() from public, anon, authenticated;
grant execute on function public.set_instagram_token(uuid, text) to service_role;
grant execute on function public.get_instagram_token(uuid) to service_role;

-- O painel vê a conta (sem o token); conectar, mudar e desconectar passam pelo servidor.
alter table public.instagram_accounts enable row level security;
revoke all on public.instagram_accounts from anon, authenticated;
grant select (clinic_id, ig_user_id, username, name, token_expires_at, reply_comments, status,
              last_error, connected_at) on public.instagram_accounts to authenticated;

create policy "membros veem a conta do Instagram" on public.instagram_accounts
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- 4. Caixa de entrada: o canal e o @ de cada conversa
-- ---------------------------------------------------------------------
drop function public.attendance_inbox(uuid);

create function public.attendance_inbox(p_clinic_id uuid)
returns table (
  id                      bigint,
  contact_phone           text,
  contact_id              uuid,
  contact_name            text,
  channel                 text,
  instagram_username      text,
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
         c.channel, nullif(ct.instagram_username, ''),
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

-- ---------------------------------------------------------------------
-- 5. Contatos a fazer: só quem tem WhatsApp (o Instagram não deixa a clínica puxar conversa)
-- ---------------------------------------------------------------------
create or replace function public.potential_contacts(p_clinic_id uuid, p_limit integer)
returns table (
  contact_id      uuid,
  phone           text,
  name            text,
  stage_name      text,
  last_contact_at timestamptz,
  conversations   bigint,
  last_status     text,
  last_reason     text,
  last_summary    text,
  conversation_id bigint,
  score           integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select c.*
      from public.contacts c
     where c.clinic_id = p_clinic_id
       and c.phone is not null
       and c.opted_out_at is null
       and c.last_contact_at between now() - interval '180 days' and now() - interval '2 days'
       and not exists (select 1 from public.follow_ups f
                        where f.contact_id = c.id and f.status = 'pendente')
       and not exists (select 1 from public.appointment_log l
                        where l.contact_id = c.id and l.status <> 'cancelado'
                          and (l.starts_at > now() or l.booked_at > now() - interval '90 days'))
  )
  select c.id, c.phone, coalesce(nullif(c.name, ''), nullif(c.whatsapp_name, ''), nullif('@' || c.instagram_username, '@')),
         s.name, c.last_contact_at,
         (select count(*) from public.conversations v where v.contact_id = c.id),
         last.status::text, r.name, last.summary, last.id,
         (case s.kind when 'perdido' then 0 else coalesce(s.sort_order, 0) / 10 end)
           + case when last.status = 'concluida' then 3 else 1 end
           + case when c.last_contact_at > now() - interval '30 days' then 3
                  when c.last_contact_at > now() - interval '90 days' then 2 else 1 end
           + least((select count(*) from public.conversations v where v.contact_id = c.id), 3)::integer
           as score
    from candidates c
    left join public.pipeline_stages s on s.id = c.stage_id
    join lateral (
      select v.id, v.status, v.summary, v.contact_reason_id
        from public.conversations v
       where v.contact_id = c.id and v.status <> 'aberta'
       order by v.last_message_at desc
       limit 1
    ) last on true
    left join public.contact_reasons r on r.id = last.contact_reason_id
   -- Só quem escreveu de verdade (não só recebeu uma mensagem da clínica).
   where exists (select 1 from public.messages m
                  join public.conversations v on v.id = m.conversation_id
                 where v.contact_id = c.id and m.role = 'user')
   order by score desc, c.last_contact_at desc
   limit least(greatest(p_limit, 1), 500);
$$;
