-- =====================================================================
-- LumenzIA — estrutura do banco (Supabase / Postgres)
--
-- Tudo gira em torno da CLÍNICA (public.clinics). Uma pessoa entra pelo Supabase Auth
-- (auth.users), ganha um perfil (public.profiles) e é ligada a uma ou mais clínicas por
-- public.clinic_members (dona = owner, equipe = staff). As regras de acesso (RLS) ficam em
-- 20261019000002_rls.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.member_role as enum ('owner', 'staff');
create type public.subscription_status as enum ('pending', 'authorized', 'paused', 'cancelled');
create type public.payment_status as enum ('approved', 'rejected');
create type public.integration_mode as enum ('webhook', 'custom');
create type public.conversation_status as enum ('aberta', 'concluida', 'abandonada');
-- ia = a IA está respondendo | pendente = a IA pediu ajuda humana | equipe = um humano assumiu
create type public.attendance_state as enum ('ia', 'pendente', 'equipe');
-- user = paciente | model = IA | staff = alguém da equipe, manualmente
create type public.message_role as enum ('user', 'model', 'staff');
create type public.appointment_status as enum ('agendado', 'concluido', 'cancelado');

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Pessoas e clínicas
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null default '',
  phone         text,
  -- equipe LumenzIA: acessa o painel do administrador e a parte técnica de todas as clínicas
  is_admin      boolean not null default false,
  -- IP do último login, para avisar por e-mail quando entrar de um IP novo
  last_login_ip text,
  created_at    timestamptz not null default now()
);

create table public.clinics (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  -- Conteúdo da assistente (a própria clínica edita)
  assistant_name             text not null default 'Assistente',
  tone                       text not null default 'acolhedor',
  business_info              text not null default '',  -- procedimentos, preços, endereço...
  past_conversations         text not null default '',  -- conversas reais coladas em texto
  behavior_rules             text not null default '',  -- regras extras de comportamento
  is_active                  boolean not null default false, -- assistente respondendo no WhatsApp
  conversation_timeout_hours integer check (conversation_timeout_hours between 1 and 168), -- null = padrão global
  -- Funcionamento (a IA usa para orientar o paciente; feriado nacional é calculado no servidor)
  work_days                  smallint[] not null default '{1,2,3,4,5}'
                               check (work_days <@ '{1,2,3,4,5,6,7}'), -- 1 = segunda ... 7 = domingo
  work_hours_start           time,
  work_hours_end             time,
  works_on_holidays          boolean not null default false,
  extra_closed_dates         text not null default '', -- feriados locais e outros fechamentos, texto livre
  -- Parte técnica (só a equipe LumenzIA edita, pelo servidor)
  whatsapp_phone_number_id   text unique,
  staff_phone_number         text,     -- recebe o aviso de "precisa de atendimento humano"
  reminder_template_name     text,     -- template aprovado na Meta para o lembrete de agendamento
  staff_alert_template_name  text,     -- template aprovado na Meta para o aviso à equipe
  template_language          text not null default 'pt_BR',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create trigger clinics_updated_at before update on public.clinics
  for each row execute function public.set_updated_at();

create table public.clinic_members (
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

create index clinic_members_user_idx on public.clinic_members (user_id);

-- Ponteiros para segredos guardados no Supabase Vault (token do WhatsApp, chave da agenda).
-- Nunca é exposta ao navegador: só o servidor (service_role) lê, pelas funções de
-- 20261019000003_storage_vault_realtime.sql.
create table public.clinic_secrets (
  clinic_id                uuid primary key references public.clinics (id) on delete cascade,
  whatsapp_token_secret_id uuid,
  agenda_api_key_secret_id uuid,
  updated_at               timestamptz not null default now()
);

create trigger clinic_secrets_updated_at before update on public.clinic_secrets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Planos, assinaturas e pagamentos
-- ---------------------------------------------------------------------
-- Planos por volume de mensagens da IA por ciclo de 30 dias; cobrança mensal recorrente.
create table public.plans (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  name          text not null,
  description   text not null default '',
  price_cents   integer not null check (price_cents >= 0), -- 19700 = R$ 197,00
  message_quota integer not null check (message_quota > 0),
  features      jsonb not null default '[]',
  highlight     boolean not null default false,
  active        boolean not null default true,
  sort_order    integer not null default 0
);

-- Uma assinatura recorrente por clínica. O acesso está ativo enquanto current_period_end (ou
-- grace_until, na tolerância após uma cobrança recusada) estiver no futuro.
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  clinic_id                 uuid not null references public.clinics (id) on delete cascade,
  plan_id                   bigint not null references public.plans (id),
  mp_preapproval_id         text unique, -- id da assinatura no Mercado Pago
  status                    public.subscription_status not null default 'pending',
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  grace_until               timestamptz,
  messages_used_this_period integer not null default 0,
  quota_alert_sent_at       timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index subscriptions_clinic_idx on public.subscriptions (clinic_id, created_at desc);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Extrato de cobranças. O índice único impede aplicar duas vezes a mesma cobrança reenviada
-- pelo webhook do Mercado Pago.
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references public.subscriptions (id) on delete cascade,
  provider_payment_id text unique,
  amount_cents        integer not null,
  status              public.payment_status not null,
  created_at          timestamptz not null default now()
);

create index payments_subscription_idx on public.payments (subscription_id, created_at desc);

-- ---------------------------------------------------------------------
-- Conteúdo que a clínica configura para a assistente
-- ---------------------------------------------------------------------
create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  question   text not null check (char_length(question) <= 500),
  answer     text not null check (char_length(answer) <= 2000),
  sort_order integer not null default 0
);

-- Perguntas que a IA pode fazer ao paciente durante a conversa
create table public.ai_questions (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  question   text not null check (char_length(question) <= 500),
  sort_order integer not null default 0
);

-- Motivos de contato, usados para classificar cada conversa depois de encerrada
create table public.contact_reasons (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  name        text not null check (char_length(name) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  sort_order  integer not null default 0
);

-- Procedimentos agendáveis, com duração (usada para calcular o fim do agendamento)
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  name             text not null check (char_length(name) <= 120),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 720),
  sort_order       integer not null default 0
);

-- Profissionais que atendem; a IA pergunta com quem o paciente quer e repassa o nome à agenda
create table public.professionals (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  name       text not null check (char_length(name) <= 120),
  sort_order integer not null default 0
);

-- Fotos que a IA pode enviar. O arquivo fica no bucket "clinic-images", em {clinic_id}/{arquivo}.
create table public.images (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics (id) on delete cascade,
  storage_path  text not null unique,
  original_name text not null default '',
  description   text not null check (char_length(description) <= 500), -- quando a IA deve usar
  created_at    timestamptz not null default now()
);

create index faqs_clinic_idx on public.faqs (clinic_id, sort_order);
create index ai_questions_clinic_idx on public.ai_questions (clinic_id, sort_order);
create index contact_reasons_clinic_idx on public.contact_reasons (clinic_id, sort_order);
create index services_clinic_idx on public.services (clinic_id, sort_order);
create index professionals_clinic_idx on public.professionals (clinic_id, sort_order);
create index images_clinic_idx on public.images (clinic_id, created_at);

-- Conexão com a agenda/sistema de gestão da clínica (parte técnica: só a equipe LumenzIA edita;
-- a clínica só escolhe o lembrete automático).
create table public.integrations (
  clinic_id             uuid primary key references public.clinics (id) on delete cascade,
  provider_name         text not null default '', -- rótulo livre: "Google Calendar", "Clínica Experts"...
  mode                  public.integration_mode not null default 'webhook',
  webhook_url           text,
  actions_config        jsonb,   -- modo "custom": método/URL/headers/body por ação
  enabled               boolean not null default false,
  reminder_hours_before integer not null default 0 check (reminder_hours_before between 0 and 168), -- 0 = sem lembrete
  updated_at            timestamptz not null default now()
);

create trigger integrations_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Conversas, mensagens e agendamentos
-- ---------------------------------------------------------------------
-- Uma conversa é uma sessão de atendimento com um contato: fica "aberta" enquanto a pessoa
-- responde; depois de um tempo parada, um job a encerra e classifica motivo + desfecho.
create table public.conversations (
  id                bigint generated always as identity primary key,
  clinic_id         uuid not null references public.clinics (id) on delete cascade,
  contact_phone     text not null,
  started_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now(),
  closed_at         timestamptz,
  status            public.conversation_status not null default 'aberta',
  contact_reason_id uuid references public.contact_reasons (id) on delete set null,
  summary           text,
  attendance_state  public.attendance_state not null default 'ia',
  needs_human_at    timestamptz
);

create index conversations_clinic_idx on public.conversations (clinic_id, last_message_at desc);
create index conversations_open_lookup_idx on public.conversations (clinic_id, contact_phone, status, last_message_at desc);
create index conversations_attendance_idx on public.conversations (clinic_id, status, attendance_state);

create table public.messages (
  id              bigint generated always as identity primary key,
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  contact_phone   text not null,
  role            public.message_role not null,
  content         text not null,
  wa_message_id   text unique, -- evita responder duas vezes à mesma mensagem do WhatsApp
  sent_by         uuid references public.profiles (id) on delete set null, -- quem da equipe enviou (role = staff)
  sent_image_id   uuid references public.images (id) on delete set null,   -- foto enviada junto
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, id);
create index messages_clinic_contact_idx on public.messages (clinic_id, contact_phone, id);

-- Cópia local dos agendamentos (a agenda de verdade é a do sistema da clínica): serve para o
-- lembrete automático e para a lista de próximos agendamentos no painel.
create table public.appointments (
  id                bigint generated always as identity primary key,
  clinic_id         uuid not null references public.clinics (id) on delete cascade,
  contact_phone     text not null,
  patient_name      text not null default '',
  procedure_name    text not null default '',
  professional_name text not null default '',
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            public.appointment_status not null default 'agendado',
  external_ref      text, -- id no sistema externo (ex.: evento do Google Calendar)
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index appointments_clinic_idx on public.appointments (clinic_id, starts_at desc);
create index appointments_reminder_idx on public.appointments (status, starts_at) where reminder_sent_at is null;

-- ---------------------------------------------------------------------
-- Auditoria das ações técnicas da equipe LumenzIA (12 meses; details nunca guarda segredos)
-- ---------------------------------------------------------------------
create table public.admin_audit_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid references public.profiles (id) on delete set null,
  clinic_id  uuid references public.clinics (id) on delete set null,
  action     text not null,
  details    text not null default '',
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- Automação de cadastro
-- ---------------------------------------------------------------------
-- Toda clínica nasce com a linha de integração (desligada) e a de segredos (vazia).
create function public.handle_new_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.integrations (clinic_id) values (new.id);
  insert into public.clinic_secrets (clinic_id) values (new.id);
  return new;
end;
$$;

create trigger on_clinic_created after insert on public.clinics
  for each row execute function public.handle_new_clinic();

-- Ao criar a conta (Supabase Auth), cria o perfil e, se o cadastro informou o nome da clínica
-- (options.data.clinic_name no signUp), cria a clínica com a pessoa como dona.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_name text := nullif(trim(new.raw_user_meta_data ->> 'clinic_name'), '');
  v_clinic_id   uuid;
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );

  if v_clinic_name is not null then
    insert into public.clinics (name) values (v_clinic_name) returning id into v_clinic_id;
    insert into public.clinic_members (clinic_id, user_id, role) values (v_clinic_id, new.id, 'owner');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
