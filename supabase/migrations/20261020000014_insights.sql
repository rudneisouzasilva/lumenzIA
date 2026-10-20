-- =====================================================================
-- LumenzIA — fase 2, etapa 6: indicadores comerciais e análise da IA
--
--  - funnel_stats: sucesso até o agendamento, perdas, conversão por etapa e por motivo, motivos
--    de perda e resultado das retomadas, num período;
--  - potential_contacts: quem vale a pena chamar de novo (não agendou, não pediu para sair, sem
--    retomada marcada), com uma nota de prioridade;
--  - insights_dataset: os números de 12 meses (sem nome nem telefone) que a IA analisa;
--  - ai_insights: a análise da IA, no máximo uma por clínica por mês.
-- =====================================================================

-- "Agendou" = tem um agendamento registrado que não foi cancelado.
create function public.funnel_stats(p_clinic_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with new_contacts as (
    select c.*
      from public.contacts c
     where c.clinic_id = p_clinic_id
       and (c.first_contact_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  booked as (
    select l.contact_id, min(l.booked_at) as first_booked_at
      from public.appointment_log l
     where l.clinic_id = p_clinic_id and l.status <> 'cancelado' and l.contact_id is not null
     group by l.contact_id
  ),
  outcome as (
    select n.id, n.first_contact_at, n.stage_id, b.first_booked_at,
           case
             when b.first_booked_at >= n.first_contact_at - interval '1 hour' then 'ganho'
             when s.kind = 'perdido' then 'perdido'
             when n.last_contact_at < now() - interval '30 days' then 'perdido'
             else 'aberto'
           end as result
      from new_contacts n
      left join booked b on b.contact_id = n.id
      left join public.pipeline_stages s on s.id = n.stage_id
  ),
  -- A etapa mais adiantada que cada contato novo já alcançou (pelo histórico ou pela atual).
  reached as (
    select o.id, max(s.sort_order) as max_order
      from outcome o
      join lateral (
        select o.stage_id as stage
        union all
        select h.to_stage_id from public.contact_stage_history h where h.contact_id = o.id
      ) x on true
      join public.pipeline_stages s on s.id = x.stage and s.kind <> 'perdido'
     group by o.id
  ),
  period_conversations as (
    select v.*
      from public.conversations v
     where v.clinic_id = p_clinic_id
       and v.status <> 'aberta'
       and (v.started_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ),
  conversation_booked as (
    select v.id, v.contact_reason_id,
           exists (
             select 1 from public.appointment_log l
              where l.contact_id = v.contact_id and l.status <> 'cancelado'
                and l.booked_at between v.started_at and v.started_at + interval '30 days'
           ) as booked
      from period_conversations v
  ),
  period_follow_ups as (
    select f.*,
           exists (
             select 1 from public.appointment_log l
              where l.contact_id = f.contact_id and l.status <> 'cancelado'
                and l.booked_at between f.sent_at and f.sent_at + interval '30 days'
           ) as booked
      from public.follow_ups f
     where f.clinic_id = p_clinic_id
       and f.sent_at is not null
       and (f.sent_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select jsonb_build_object(
    'new_contacts', (select count(*) from outcome),
    'won',          (select count(*) from outcome where result = 'ganho'),
    'lost',         (select count(*) from outcome where result = 'perdido'),
    'open',         (select count(*) from outcome where result = 'aberto'),
    'avg_hours_to_book', (
      select round(avg(extract(epoch from (first_booked_at - first_contact_at)) / 3600)::numeric, 1)
        from outcome where result = 'ganho' and first_booked_at >= first_contact_at
    ),
    'by_stage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'stage', s.name, 'color', s.color, 'kind', s.kind,
               'reached', (select count(*) from reached r where r.max_order >= s.sort_order),
               'now', (select count(*) from outcome o where o.stage_id = s.id))
             order by s.sort_order)
        from public.pipeline_stages s
       where s.clinic_id = p_clinic_id
    ), '[]'::jsonb),
    'by_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'total', total, 'booked', booked)
                       order by total desc, reason)
        from (
          select coalesce(r.name, 'Sem motivo identificado') as reason,
                 count(*) as total, count(*) filter (where cb.booked) as booked
            from conversation_booked cb
            left join public.contact_reasons r on r.id = cb.contact_reason_id
           group by 1
        ) x
    ), '[]'::jsonb),
    'lost_reasons', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'total', total) order by total desc)
        from (
          select coalesce(lr.name, 'Sem motivo informado') as reason, count(*) as total
            from public.contacts c
            join public.pipeline_stages s on s.id = c.stage_id and s.kind = 'perdido'
            left join public.lost_reasons lr on lr.id = c.lost_reason_id
           where c.clinic_id = p_clinic_id
             and (c.stage_changed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
           group by 1
        ) x
    ), '[]'::jsonb),
    'follow_ups', jsonb_build_object(
      'sent',      (select count(*) from period_follow_ups),
      'responded', (select count(*) from period_follow_ups where status = 'respondido'),
      'booked',    (select count(*) from period_follow_ups where booked),
      'by_source', coalesce((
        select jsonb_object_agg(source, total)
          from (select source, count(*) as total from period_follow_ups group by 1) x
      ), '{}'::jsonb)
    )
  );
$$;

revoke execute on function public.funnel_stats(uuid, date, date) from public, anon;
grant execute on function public.funnel_stats(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Contatos a fazer
-- ---------------------------------------------------------------------
-- Gente que conversou com a clínica, mostrou interesse e não agendou: sem agendamento futuro nem
-- nos últimos 90 dias, sem retomada marcada, sem pedido para sair, e com o último contato entre
-- 2 e 180 dias atrás. A nota soma etapa, conversa concluída (dúvida respondida) e recência.
create function public.potential_contacts(p_clinic_id uuid, p_limit integer)
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
       and c.opted_out_at is null
       and c.last_contact_at between now() - interval '180 days' and now() - interval '2 days'
       and not exists (select 1 from public.follow_ups f
                        where f.contact_id = c.id and f.status = 'pendente')
       and not exists (select 1 from public.appointment_log l
                        where l.contact_id = c.id and l.status <> 'cancelado'
                          and (l.starts_at > now() or l.booked_at > now() - interval '90 days'))
  )
  select c.id, c.phone, coalesce(nullif(c.name, ''), c.whatsapp_name), s.name, c.last_contact_at,
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

revoke execute on function public.potential_contacts(uuid, integer) from public, anon;
grant execute on function public.potential_contacts(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- O que a IA analisa (só o servidor; sem nome nem telefone de ninguém)
-- ---------------------------------------------------------------------
create function public.insights_dataset(p_clinic_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with months as (
    select date_trunc('month', d)::date as month
      from generate_series(date_trunc('month', p_from), p_to, interval '1 month') d
  ),
  conv as (
    select v.*, date_trunc('month', v.started_at at time zone 'America/Sao_Paulo')::date as month,
           exists (
             select 1 from public.appointment_log l
              where l.contact_id = v.contact_id and l.status <> 'cancelado'
                and l.booked_at between v.started_at and v.started_at + interval '30 days'
           ) as booked
      from public.conversations v
     where v.clinic_id = p_clinic_id
       and (v.started_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', public.funnel_stats(p_clinic_id, p_from, p_to),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', to_char(m.month, 'YYYY-MM'),
               'conversations', (select count(*) from conv where conv.month = m.month),
               'abandoned', (select count(*) from conv where conv.month = m.month and status = 'abandonada'),
               'with_booking', (select count(*) from conv where conv.month = m.month and booked),
               'new_contacts', (select count(*) from public.contacts c
                                 where c.clinic_id = p_clinic_id
                                   and date_trunc('month', c.first_contact_at at time zone 'America/Sao_Paulo')::date = m.month),
               'appointments', (select count(*) from public.appointment_log l
                                 where l.clinic_id = p_clinic_id and l.status <> 'cancelado'
                                   and date_trunc('month', l.booked_at at time zone 'America/Sao_Paulo')::date = m.month)
             ) order by m.month)
        from months m
    ), '[]'::jsonb),
    'by_weekday_hour', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', wd, 'hour', h, 'conversations', total, 'with_booking', b))
        from (
          select extract(isodow from started_at at time zone 'America/Sao_Paulo')::int as wd,
                 extract(hour from started_at at time zone 'America/Sao_Paulo')::int as h,
                 count(*) as total, count(*) filter (where booked) as b
            from conv group by 1, 2
        ) x
    ), '[]'::jsonb),
    'procedures', coalesce((
      select jsonb_agg(jsonb_build_object('procedure', p, 'appointments', total) order by total desc)
        from (
          select coalesce(nullif(l.procedure_name, ''), 'não informado') as p, count(*) as total
            from public.appointment_log l
           where l.clinic_id = p_clinic_id and l.status <> 'cancelado'
             and (l.booked_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
           group by 1 order by 2 desc limit 15
        ) x
    ), '[]'::jsonb),
    'staff_share', (
      select jsonb_build_object(
               'conversations', count(*),
               'with_staff', count(*) filter (where exists (
                 select 1 from public.messages m where m.conversation_id = conv.id and m.role = 'staff')))
        from conv
    ),
    -- Uma amostra dos resumos (feitos pela IA ao encerrar), das conversas sem e com agendamento.
    'summaries', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'booked', booked, 'reason', reason, 'summary', summary))
        from (
          (select v.status::text, v.booked, r.name as reason, v.summary
             from conv v left join public.contact_reasons r on r.id = v.contact_reason_id
            where v.summary is not null and not v.booked
            order by v.started_at desc limit 60)
          union all
          (select v.status::text, v.booked, r.name, v.summary
             from conv v left join public.contact_reasons r on r.id = v.contact_reason_id
            where v.summary is not null and v.booked
            order by v.started_at desc limit 30)
        ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.insights_dataset(uuid, date, date) from public, anon, authenticated;
grant execute on function public.insights_dataset(uuid, date, date) to service_role;

-- ---------------------------------------------------------------------
-- Análise da IA: uma por clínica por mês
-- ---------------------------------------------------------------------
create table public.ai_insights (
  id          bigint generated always as identity primary key,
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  month       date not null check (extract(day from month) = 1), -- mês em que foi gerada
  status      text not null default 'gerando' check (status in ('gerando', 'pronto')),
  period_from date not null,
  period_to   date not null,
  content     jsonb,
  model       text not null default '',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinic_id, month)
);

create trigger ai_insights_set_updated_at before update on public.ai_insights
  for each row execute function public.set_updated_at();

alter table public.ai_insights enable row level security;
revoke all on public.ai_insights from anon, authenticated;
grant select on public.ai_insights to authenticated;

create policy "membros veem as análises" on public.ai_insights
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
