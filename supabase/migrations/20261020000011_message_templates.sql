-- =====================================================================
-- LumenzIA — fase 2, etapa 3: mensagens prontas (templates do WhatsApp)
--
-- Fora da janela de 24 horas depois da última mensagem do paciente, o WhatsApp só aceita
-- templates aprovados pela Meta, e cada template pertence à conta do WhatsApp (WABA) de uma
-- clínica. Quando a clínica conecta o número, a LumenzIA envia sozinha para aprovação um pacote
-- de mensagens prontas com o nome da clínica; a clínica acompanha o status e pode editar o texto.
-- Templates que a clínica já tinha na Meta entram pelo "Sincronizar", com o propósito "outro".
-- =====================================================================

create table public.message_templates (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  -- Para que a LumenzIA usa: retomada_pedido (a pessoa pediu para falar depois),
  -- retomada_sem_resposta, lembrete (de agendamento), aviso_equipe, reabrir (a equipe retoma uma
  -- conversa) ou outro (criado pela clínica ou trazido da Meta).
  purpose          text not null default 'outro'
    check (purpose in ('retomada_pedido', 'retomada_sem_resposta', 'lembrete', 'aviso_equipe', 'reabrir', 'outro')),
  name             text not null check (name ~ '^[a-z0-9_]{1,512}$'),
  language         text not null default 'pt_BR',
  category         text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  body             text not null check (char_length(body) between 1 and 1024),
  footer           text not null default '' check (char_length(footer) <= 60),
  example          jsonb not null default '[]', -- um valor de exemplo para cada {{n}} do texto
  -- RASCUNHO (ainda não enviado), ERRO (a Meta recusou o envio) ou o status da Meta: PENDING,
  -- APPROVED, REJECTED, PAUSED, DISABLED, IN_APPEAL...
  status           text not null default 'RASCUNHO',
  meta_template_id text,
  rejected_reason  text,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (clinic_id, name, language)
);

-- Um template por propósito em cada clínica (os "outros" são livres).
create unique index message_templates_purpose_idx on public.message_templates (clinic_id, purpose)
  where purpose <> 'outro';
create index message_templates_meta_idx on public.message_templates (meta_template_id);

create trigger message_templates_set_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon, authenticated;
-- Só leitura no navegador: criar, editar e enviar passa pelo servidor, que fala com a Meta.
grant select on public.message_templates to authenticated;

create policy "membros veem as mensagens prontas" on public.message_templates
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
