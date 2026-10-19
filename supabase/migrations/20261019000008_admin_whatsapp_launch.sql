-- =====================================================================
-- LumenzIA — painel da equipe, "Conectar WhatsApp" e lançamento
--
-- 1. WhatsApp por clínica (modelo Tech Provider): um app da LumenzIA na Meta, um webhook, e cada
--    clínica conecta o próprio número pelo Cadastro Incorporado (Embedded Signup). O token de cada
--    clínica e o PIN de verificação em duas etapas do número ficam no Vault.
-- 2. Funções que só a equipe LumenzIA (profiles.is_admin) consegue chamar: lista de clientes e
--    equipe de uma clínica, com o e-mail de login.
-- 3. Funções do servidor para conferir os jobs antes do lançamento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. WhatsApp conectado pela própria clínica
-- ---------------------------------------------------------------------
alter table public.clinics
  add column whatsapp_waba_id       text, -- conta do WhatsApp Business (WABA) da clínica
  add column whatsapp_display_phone text, -- número como a Meta mostra: "+55 11 99999-0000"
  add column whatsapp_verified_name text, -- nome de exibição aprovado na Meta
  add column whatsapp_connected_at  timestamptz;

create index clinics_whatsapp_waba_idx on public.clinics (whatsapp_waba_id);

-- PIN de 6 dígitos da verificação em duas etapas, definido ao registrar o número na Cloud API.
-- Guardado para a equipe conseguir registrar o número de novo sem pedir à clínica.
alter table public.clinic_secrets add column whatsapp_pin_secret_id uuid;

create or replace function public.set_clinic_secret(p_clinic_id uuid, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := 'clinic:' || p_clinic_id || ':' || p_kind;
begin
  if p_kind not in ('whatsapp_token', 'agenda_api_key', 'whatsapp_pin') then
    raise exception 'tipo de segredo inválido: %', p_kind;
  end if;

  select case p_kind when 'whatsapp_token' then s.whatsapp_token_secret_id
                     when 'agenda_api_key' then s.agenda_api_key_secret_id
                     else s.whatsapp_pin_secret_id end
    into v_secret_id
    from public.clinic_secrets s where s.clinic_id = p_clinic_id;

  if not found then
    raise exception 'clínica não encontrada: %', p_clinic_id;
  end if;

  if p_value is null or p_value = '' then
    if v_secret_id is not null then
      delete from vault.secrets where id = v_secret_id;
    end if;
    v_secret_id := null;
  elsif v_secret_id is null then
    v_secret_id := vault.create_secret(p_value, v_name);
  else
    perform vault.update_secret(v_secret_id, p_value, v_name);
  end if;

  if p_kind = 'whatsapp_token' then
    update public.clinic_secrets set whatsapp_token_secret_id = v_secret_id where clinic_id = p_clinic_id;
  elsif p_kind = 'agenda_api_key' then
    update public.clinic_secrets set agenda_api_key_secret_id = v_secret_id where clinic_id = p_clinic_id;
  else
    update public.clinic_secrets set whatsapp_pin_secret_id = v_secret_id where clinic_id = p_clinic_id;
  end if;
end;
$$;

create or replace function public.get_clinic_secret(p_clinic_id uuid, p_kind text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.clinic_secrets s
  join vault.decrypted_secrets d
    on d.id = case p_kind when 'whatsapp_token' then s.whatsapp_token_secret_id
                          when 'agenda_api_key' then s.agenda_api_key_secret_id
                          when 'whatsapp_pin' then s.whatsapp_pin_secret_id end
  where s.clinic_id = p_clinic_id;
$$;

-- "create or replace" mantém as permissões, mas repetir deixa explícito: só o servidor.
revoke execute on function public.set_clinic_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_clinic_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.set_clinic_secret(uuid, text, text) to service_role;
grant execute on function public.get_clinic_secret(uuid, text) to service_role;

create or replace function public.delete_clinic_vault_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets
  where id in (old.whatsapp_token_secret_id, old.agenda_api_key_secret_id, old.whatsapp_pin_secret_id);
  return old;
end;
$$;

-- Quais segredos a clínica tem, sem revelar nenhum (para o painel da equipe mostrar "configurado").
create function public.clinic_secret_status(p_clinic_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'whatsapp_token', s.whatsapp_token_secret_id is not null,
    'agenda_api_key', s.agenda_api_key_secret_id is not null,
    'whatsapp_pin',   s.whatsapp_pin_secret_id is not null
  )
  from public.clinic_secrets s
  where s.clinic_id = p_clinic_id;
$$;

revoke execute on function public.clinic_secret_status(uuid) from public, anon, authenticated;
grant execute on function public.clinic_secret_status(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. Painel da equipe LumenzIA
-- ---------------------------------------------------------------------
create index admin_audit_log_clinic_idx on public.admin_audit_log (clinic_id, created_at desc);

-- Todas as clínicas, com dona, plano, uso e WhatsApp. security definer porque o e-mail de login
-- está em auth.users; por isso a primeira coisa é conferir que quem chama é da equipe.
create function public.admin_clinics()
returns table (
  id                     uuid,
  name                   text,
  created_at             timestamptz,
  is_active              boolean,
  whatsapp_phone_number_id text,
  whatsapp_display_phone text,
  owner_name             text,
  owner_email            text,
  owner_phone            text,
  members                bigint,
  plan_name              text,
  subscription_status    public.subscription_status,
  current_period_end     timestamptz,
  grace_until            timestamptz,
  messages_used          integer,
  message_quota          integer,
  last_message_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso restrito à equipe LumenzIA' using errcode = '42501';
  end if;

  return query
  select c.id, c.name, c.created_at, c.is_active, c.whatsapp_phone_number_id,
         c.whatsapp_display_phone,
         owner.full_name, owner.email::text, owner.phone,
         (select count(*) from public.clinic_members m where m.clinic_id = c.id),
         sub.plan_name, sub.status, sub.current_period_end, sub.grace_until,
         sub.messages_used_this_period, sub.message_quota,
         (select max(cv.last_message_at) from public.conversations cv where cv.clinic_id = c.id)
    from public.clinics c
    left join lateral (
      select p.full_name, u.email, p.phone
        from public.clinic_members m
        join public.profiles p on p.id = m.user_id
        join auth.users u on u.id = m.user_id
       where m.clinic_id = c.id and m.role = 'owner'
       order by m.created_at
       limit 1
    ) owner on true
    -- A assinatura que vale por mais tempo; sem nenhuma em dia, a mais recente.
    left join lateral (
      select pl.name as plan_name, s.status, s.current_period_end, s.grace_until,
             s.messages_used_this_period, pl.message_quota
        from public.subscriptions s
        join public.plans pl on pl.id = s.plan_id
       where s.clinic_id = c.id
       order by greatest(coalesce(s.current_period_end, '-infinity'),
                         coalesce(s.grace_until, '-infinity')) desc,
                s.created_at desc
       limit 1
    ) sub on true
   order by c.created_at desc;
end;
$$;

-- Equipe de uma clínica, com o e-mail de login.
create function public.admin_clinic_members(p_clinic_id uuid)
returns table (
  user_id    uuid,
  full_name  text,
  email      text,
  phone      text,
  role       public.member_role,
  is_admin   boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso restrito à equipe LumenzIA' using errcode = '42501';
  end if;

  return query
  select m.user_id, p.full_name, u.email::text, p.phone, m.role, p.is_admin, m.created_at,
         u.last_sign_in_at
    from public.clinic_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
   where m.clinic_id = p_clinic_id
   order by m.role, m.created_at;
end;
$$;

revoke execute on function public.admin_clinics() from public, anon;
revoke execute on function public.admin_clinic_members(uuid) from public, anon;
grant execute on function public.admin_clinics() to authenticated, service_role;
grant execute on function public.admin_clinic_members(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Conferência dos jobs antes do lançamento (só o servidor)
-- ---------------------------------------------------------------------
-- Compara a senha que o site tem (CRON_SECRET) com a do Vault sem devolver nenhuma das duas, e
-- resume o que o pg_cron e o pg_net registraram nas últimas 24 horas.
create function public.launch_status(p_cron_secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'lumenzia_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lumenzia_cron_secret';

  return jsonb_build_object(
    'app_url', v_url,
    'cron_secret_in_vault', v_secret is not null,
    'cron_secret_matches', v_secret is not null and coalesce(p_cron_secret, '') = v_secret,
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', j.jobname,
               'schedule', j.schedule,
               'active', j.active,
               'last_status', last.status,
               'last_run', last.start_time,
               'failures_24h', (select count(*) from cron.job_run_details d
                                 where d.jobid = j.jobid and d.status = 'failed'
                                   and d.start_time > now() - interval '24 hours'))
             order by j.jobname)
        from cron.job j
        left join lateral (
          select d.status, d.start_time from cron.job_run_details d
           where d.jobid = j.jobid order by d.start_time desc limit 1
        ) last on true
       where j.jobname like 'lumenzia-%'
    ), '[]'::jsonb),
    -- Respostas do site às chamadas dos jobs (pg_net guarda poucas horas de histórico)
    'http_ok_24h', (select count(*) from net._http_response r
                     where r.created > now() - interval '24 hours'
                       and r.status_code between 200 and 299),
    'http_failed_24h', (select count(*) from net._http_response r
                         where r.created > now() - interval '24 hours'
                           and (r.status_code is null or r.status_code not between 200 and 299)),
    'http_last_error', (select coalesce(r.status_code::text, r.error_msg)
                          from net._http_response r
                         where r.created > now() - interval '24 hours'
                           and (r.status_code is null or r.status_code not between 200 and 299)
                         order by r.created desc limit 1)
  );
end;
$$;

-- Troca o endereço que os jobs chamam (ao mudar para o domínio próprio).
create function public.set_cron_app_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url is null or p_url !~ '^https://[^/\s]+$' then
    raise exception 'endereço inválido: use https://dominio, sem barra no fim';
  end if;
  select id into v_id from vault.secrets where name = 'lumenzia_app_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'lumenzia_app_url', 'Endereço do site que os jobs do pg_cron chamam');
  else
    perform vault.update_secret(v_id, p_url, 'lumenzia_app_url');
  end if;
end;
$$;

revoke execute on function public.launch_status(text) from public, anon, authenticated;
revoke execute on function public.set_cron_app_url(text) from public, anon, authenticated;
grant execute on function public.launch_status(text) to service_role;
grant execute on function public.set_cron_app_url(text) to service_role;
