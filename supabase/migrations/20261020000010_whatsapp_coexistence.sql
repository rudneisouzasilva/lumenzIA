-- =====================================================================
-- LumenzIA — fase 2, etapa 2: WhatsApp Business que a clínica já usa (coexistência)
--
-- A clínica conecta o número que continua no app WhatsApp Business do celular. A Meta manda:
--  - "history": as conversas dos últimos 6 meses, em partes, logo depois da conexão;
--  - "smb_app_state_sync": os contatos salvos no app;
--  - "smb_message_echoes": cada mensagem que a equipe envia pelo celular, na hora.
-- Tudo isso entra no painel como histórico real. Uma resposta pelo celular pausa a IA naquela
-- conversa, para as duas não falarem ao mesmo tempo.
-- =====================================================================

alter table public.clinics
  add column whatsapp_coexistence      boolean not null default false,
  -- nao_solicitado | aguardando (a Meta ainda não mandou) | importando | concluido
  -- | recusado (a clínica não quis compartilhar no celular) | erro
  add column whatsapp_history_status   text not null default 'nao_solicitado'
    check (whatsapp_history_status in ('nao_solicitado', 'aguardando', 'importando', 'concluido', 'recusado', 'erro')),
  add column whatsapp_history_progress smallint not null default 0
    check (whatsapp_history_progress between 0 and 100),
  add column whatsapp_history_messages integer not null default 0; -- mensagens importadas

-- De onde veio cada mensagem:
--  whatsapp  = fluxo normal (paciente escrevendo ou a IA respondendo)
--  painel    = alguém da equipe pela caixa de entrada da LumenzIA
--  celular   = alguém da equipe pelo app WhatsApp Business (coexistência)
--  historico = importada do celular na conexão
--  template  = mensagem pronta enviada pela equipe
--  retomada  = mensagem pronta enviada pela retomada automática
alter table public.messages
  add column origin text not null default 'whatsapp'
    check (origin in ('whatsapp', 'painel', 'celular', 'historico', 'template', 'retomada'));

update public.messages set origin = 'painel' where role = 'staff';

-- Conversas importadas do histórico: já chegam encerradas e são classificadas aos poucos pelo job
-- (needs_classification), sem pressa e sem estourar a cota do Gemini.
alter table public.conversations
  add column imported             boolean not null default false,
  add column needs_classification boolean not null default false;

create index conversations_needs_classification_idx on public.conversations (clinic_id)
  where needs_classification;
create index conversations_imported_lookup_idx on public.conversations (clinic_id, contact_phone, started_at)
  where imported;

-- Conversas importadas que ainda esperam motivo e resumo (o job pega poucas por vez).
create function public.unclassified_conversations(p_limit integer)
returns table (id bigint, clinic_id uuid)
language sql
stable
set search_path = ''
as $$
  select c.id, c.clinic_id
    from public.conversations c
   where c.needs_classification
   order by c.started_at desc
   limit p_limit;
$$;

revoke execute on function public.unclassified_conversations(integer) from public, anon, authenticated;
grant execute on function public.unclassified_conversations(integer) to service_role;

-- Andamento da importação do histórico, somado de uma vez no banco (as partes chegam juntas).
create function public.add_history_progress(
  p_clinic_id uuid,
  p_messages integer,
  p_progress integer
)
returns void
language sql
set search_path = ''
as $$
  update public.clinics
     set whatsapp_history_messages = whatsapp_history_messages + greatest(p_messages, 0),
         whatsapp_history_progress = greatest(whatsapp_history_progress, least(greatest(p_progress, 0), 100)),
         whatsapp_history_status = case
           when greatest(whatsapp_history_progress, p_progress) >= 100 then 'concluido'
           else 'importando'
         end
   where id = p_clinic_id;
$$;

revoke execute on function public.add_history_progress(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.add_history_progress(uuid, integer, integer) to service_role;
