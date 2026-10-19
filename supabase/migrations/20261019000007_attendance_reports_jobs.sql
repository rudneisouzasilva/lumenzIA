-- =====================================================================
-- LumenzIA — atendimento ao vivo, relatórios e jobs automáticos
--
-- 1. Funções que o painel chama (protegidas pelo RLS de quem chama): caixa de entrada do
--    atendimento e números do relatório.
-- 2. Funções que só o servidor chama: lembretes a enviar e conversas paradas a encerrar.
-- 3. Jobs no pg_cron. Os que precisam do Gemini, do WhatsApp ou da agenda da clínica chamam
--    rotas protegidas do site (/api/cron/...) pelo pg_net; as limpezas rodam direto no banco.
--
-- O endereço do site e a senha dos jobs ficam no Vault. A senha é gerada aqui mesmo e precisa
-- ser copiada para a variável CRON_SECRET da Vercel (o README explica).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- Caixa de entrada: conversas em andamento, com a última mensagem
-- ---------------------------------------------------------------------
-- security invoker: roda com as permissões de quem chama, então o RLS de conversations e
-- messages decide o que aparece (uma clínica nunca vê a fila de outra).
create function public.attendance_inbox(p_clinic_id uuid)
returns table (
  id                      bigint,
  contact_phone           text,
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
  select c.id, c.contact_phone, c.attendance_state, c.needs_human_at, c.started_at,
         c.last_message_at, coalesce(stats.total, 0), last.content, last.role, stats.last_patient_at
    from public.conversations c
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
-- Relatório: números do período (dias no horário de Brasília)
-- ---------------------------------------------------------------------
create function public.conversation_stats(p_clinic_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with period as (
    select c.*
      from public.conversations c
     where c.clinic_id = p_clinic_id
       and (c.started_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  period_messages as (
    select m.role, m.conversation_id
      from public.messages m
     where m.clinic_id = p_clinic_id
       and (m.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select jsonb_build_object(
    'total',      (select count(*) from period),
    'concluida',  (select count(*) from period where status = 'concluida'),
    'abandonada', (select count(*) from period where status = 'abandonada'),
    'aberta',     (select count(*) from period where status = 'aberta'),
    -- "agora" não depende do período: uma conversa que começou antes continua em andamento
    'open_now',   (select count(*) from public.conversations
                    where clinic_id = p_clinic_id and status = 'aberta'),
    'pending_now', (select count(*) from public.conversations
                     where clinic_id = p_clinic_id and status = 'aberta'
                       and attendance_state = 'pendente'),
    'ai_messages',    (select count(*) from period_messages where role = 'model'),
    'staff_messages', (select count(*) from period_messages where role = 'staff'),
    'staff_conversations',
      (select count(distinct conversation_id) from period_messages where role = 'staff'),
    'contacts',   (select count(distinct contact_phone) from period),
    'by_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'total', total) order by total desc, reason)
        from (
          select coalesce(r.name, 'Sem motivo identificado') as reason, count(*) as total
            from period p
            left join public.contact_reasons r on r.id = p.contact_reason_id
           where p.status <> 'aberta'
           group by 1
        ) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day::date, 'total', coalesce(x.total, 0)) order by d.day)
        from generate_series(p_from, p_to, interval '1 day') as d(day)
        left join (
          select (started_at at time zone 'America/Sao_Paulo')::date as day, count(*) as total
            from period group by 1
        ) x on x.day = d.day::date
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.conversation_stats(uuid, date, date) from public, anon;
grant execute on function public.conversation_stats(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Para os jobs (só o servidor)
-- ---------------------------------------------------------------------
-- Agendamentos cujo início cai dentro da janela de lembrete escolhida pela clínica e que ainda
-- não foram avisados. Rodando a cada 5 minutos, cada um é pego uma vez só.
create function public.due_reminders()
returns table (
  id             bigint,
  clinic_id      uuid,
  contact_phone  text,
  patient_name   text,
  procedure_name text,
  starts_at      timestamptz,
  external_ref   text
)
language sql
stable
set search_path = ''
as $$
  select ap.id, ap.clinic_id, ap.contact_phone, ap.patient_name, ap.procedure_name, ap.starts_at,
         ap.external_ref
    from public.appointments ap
    join public.integrations i on i.clinic_id = ap.clinic_id
   where ap.status = 'agendado'
     and ap.reminder_sent_at is null
     and i.enabled
     and i.reminder_hours_before > 0
     and ap.starts_at between now() and now() + make_interval(hours => i.reminder_hours_before)
   order by ap.starts_at
   limit 500;
$$;

-- Conversas em andamento paradas há mais que o tempo limite da clínica (ou o padrão informado).
create function public.idle_conversations(p_default_hours integer, p_limit integer)
returns table (id bigint, clinic_id uuid, last_message_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select c.id, c.clinic_id, c.last_message_at
    from public.conversations c
    join public.clinics cl on cl.id = c.clinic_id
   where c.status = 'aberta'
     and c.last_message_at
         < now() - make_interval(hours => coalesce(cl.conversation_timeout_hours, p_default_hours))
   order by c.last_message_at
   limit p_limit;
$$;

revoke execute on function public.due_reminders() from public, anon, authenticated;
revoke execute on function public.idle_conversations(integer, integer) from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;
grant execute on function public.idle_conversations(integer, integer) to service_role;

-- Limpeza diária:
--  1) agendamento "agendado" que já passou vira "concluido";
--  2) concluídos e cancelados com mais de 30 dias são apagados;
--  3) a auditoria da equipe LumenzIA guarda 12 meses.
create function public.run_daily_cleanup()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_completed integer;
  v_purged    integer;
  v_audit     integer;
begin
  update public.appointments set status = 'concluido'
   where status = 'agendado' and starts_at <= now();
  get diagnostics v_completed = row_count;

  delete from public.appointments
   where status in ('concluido', 'cancelado') and starts_at <= now() - interval '30 days';
  get diagnostics v_purged = row_count;

  delete from public.admin_audit_log where created_at <= now() - interval '365 days';
  get diagnostics v_audit = row_count;

  return jsonb_build_object('concluidos', v_completed, 'apagados', v_purged, 'auditoria', v_audit);
end;
$$;

revoke execute on function public.run_daily_cleanup() from public, anon, authenticated;
grant execute on function public.run_daily_cleanup() to service_role;

-- ---------------------------------------------------------------------
-- Chamada às rotas de job do site
-- ---------------------------------------------------------------------
-- Endereço do site (não é segredo, mas fica junto da senha) e senha dos jobs, gerada aleatória.
-- Rodar a migração de novo não troca a senha.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'lumenzia_app_url') then
    perform vault.create_secret('https://lumenz-ia.vercel.app', 'lumenzia_app_url',
                                'Endereço do site que os jobs do pg_cron chamam');
  end if;
  if not exists (select 1 from vault.secrets where name = 'lumenzia_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
                                'lumenzia_cron_secret',
                                'Senha dos jobs: a mesma da variável CRON_SECRET na Vercel');
  end if;
end;
$$;

-- POST em {site}{p_path} com a senha no cabeçalho Authorization. A rota responde na hora e faz o
-- trabalho depois, então o tempo limite aqui é só para a conexão.
create function public.invoke_cron_route(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'lumenzia_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lumenzia_cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'lumenzia: endereço ou senha dos jobs não está no Vault';
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || p_path,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.invoke_cron_route(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Agenda dos jobs (pg_cron roda em UTC; Brasília = UTC-3)
-- cron.schedule com o mesmo nome substitui o job, então dá para rodar esta migração de novo.
-- ---------------------------------------------------------------------
select cron.schedule('lumenzia-lembretes', '*/5 * * * *',
  $$select public.invoke_cron_route('/api/cron/lembretes')$$);
select cron.schedule('lumenzia-classificar', '*/15 * * * *',
  $$select public.invoke_cron_route('/api/cron/classificar')$$);
select cron.schedule('lumenzia-agenda', '0 9 * * *',          -- 06:00 em Brasília
  $$select public.invoke_cron_route('/api/cron/agenda')$$);
select cron.schedule('lumenzia-limpeza', '30 9 * * *',        -- 06:30 em Brasília
  $$select public.run_daily_cleanup()$$);
-- O próprio pg_cron guarda um registro de cada execução: mantém só a última semana.
select cron.schedule('lumenzia-limpeza-cron', '45 9 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
