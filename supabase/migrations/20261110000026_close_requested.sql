-- Encerramento combinado com a pessoa: quando o assunto termina, a assistente avisa que encerra
-- o atendimento em 10 minutos se for só isso, e marca a conversa. O job de classificação (agora a
-- cada 5 minutos) encerra a conversa passado esse tempo, se ninguém escreveu depois do aviso.
-- Pode rodar de novo sem problema.

alter table public.conversations
  add column if not exists close_requested_at timestamptz;

create or replace function public.idle_conversations(p_default_hours integer, p_limit integer)
returns table (id bigint, clinic_id uuid, last_message_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select c.id, c.clinic_id, c.last_message_at
    from public.conversations c
    join public.clinics cl on cl.id = c.clinic_id
   where c.status = 'aberta'
     and (
       c.last_message_at
         < now() - make_interval(hours => coalesce(cl.conversation_timeout_hours, p_default_hours))
       or (
         -- Avisou que ia encerrar, passaram 10 minutos e só a assistente escreveu depois disso.
         c.close_requested_at is not null
         and c.close_requested_at < now() - interval '10 minutes'
         and c.attendance_state = 'ia'
         and not exists (
           select 1 from public.messages m
            where m.conversation_id = c.id
              and m.role <> 'model'
              and m.created_at > c.close_requested_at
         )
       )
     )
   order by c.last_message_at
   limit p_limit;
$$;

revoke execute on function public.idle_conversations(integer, integer) from public, anon, authenticated;
grant execute on function public.idle_conversations(integer, integer) to service_role;

-- A cada 5 minutos, para o encerramento combinado não atrasar muito além dos 10 minutos.
select cron.schedule('lumenzia-classificar', '*/5 * * * *',
  $$select public.invoke_cron_route('/api/cron/classificar')$$);
