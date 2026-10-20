-- =====================================================================
-- LumenzIA — fase 2, etapa 7: Google Agenda conectado pela própria clínica
--
-- A clínica entra com uma ou mais contas do Google (OAuth) e escolhe uma agenda para cada
-- profissional, e uma agenda principal para quando não há profissional. A mesma conta pode ter
-- várias agendas. O token de acesso fica no Vault. O webhook e a API própria continuam valendo
-- para os outros sistemas (configurados pela equipe LumenzIA).
-- =====================================================================

alter type public.integration_mode add value if not exists 'google';

create table public.google_accounts (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references public.clinics (id) on delete cascade,
  email                   text not null check (char_length(email) <= 320),
  refresh_token_secret_id uuid,
  status                  text not null default 'ativo' check (status in ('ativo', 'desconectado')),
  last_error              text,
  connected_by            uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (clinic_id, email)
);

create trigger google_accounts_set_updated_at before update on public.google_accounts
  for each row execute function public.set_updated_at();

alter table public.professionals
  add column google_account_id    uuid references public.google_accounts (id) on delete set null,
  add column google_calendar_id   text check (char_length(google_calendar_id) <= 300),
  add column google_calendar_name text not null default '' check (char_length(google_calendar_name) <= 200);

alter table public.integrations
  add column google_account_id    uuid references public.google_accounts (id) on delete set null,
  add column google_calendar_id   text check (char_length(google_calendar_id) <= 300),
  add column google_calendar_name text not null default '' check (char_length(google_calendar_name) <= 200);

-- A conta do Google escolhida precisa ser da mesma clínica.
create function public.check_google_account_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.google_account_id is not null and not exists (
    select 1 from public.google_accounts a
     where a.id = new.google_account_id and a.clinic_id = new.clinic_id
  ) then
    raise exception 'conta do Google de outra clínica' using errcode = '23503';
  end if;
  if new.google_account_id is null then
    new.google_calendar_id := null;
    new.google_calendar_name := '';
  end if;
  return new;
end;
$$;

create trigger professionals_google_account before insert or update of google_account_id, google_calendar_id
  on public.professionals for each row execute function public.check_google_account_clinic();
create trigger integrations_google_account before insert or update of google_account_id, google_calendar_id
  on public.integrations for each row execute function public.check_google_account_clinic();

-- ---------------------------------------------------------------------
-- O token da conta, no Vault (só o servidor)
-- ---------------------------------------------------------------------
create function public.set_google_refresh_token(p_account_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := 'google:' || p_account_id;
begin
  select refresh_token_secret_id into v_secret_id
    from public.google_accounts where id = p_account_id;
  if not found then
    raise exception 'conta do Google não encontrada: %', p_account_id;
  end if;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_token, v_name);
    update public.google_accounts set refresh_token_secret_id = v_secret_id where id = p_account_id;
  else
    perform vault.update_secret(v_secret_id, p_token, v_name);
  end if;
end;
$$;

create function public.get_google_refresh_token(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
    from public.google_accounts a
    join vault.decrypted_secrets d on d.id = a.refresh_token_secret_id
   where a.id = p_account_id;
$$;

create function public.delete_google_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.refresh_token_secret_id is not null then
    delete from vault.secrets where id = old.refresh_token_secret_id;
  end if;
  return old;
end;
$$;

create trigger google_accounts_vault_cleanup after delete on public.google_accounts
  for each row execute function public.delete_google_vault_secret();

revoke execute on function public.set_google_refresh_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_google_refresh_token(uuid) from public, anon, authenticated;
revoke execute on function public.delete_google_vault_secret() from public, anon, authenticated;
revoke execute on function public.check_google_account_clinic() from public, anon, authenticated;
grant execute on function public.set_google_refresh_token(uuid, text) to service_role;
grant execute on function public.get_google_refresh_token(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Acesso: o painel vê as contas (sem o token); conectar, escolher e desconectar passam pelo
-- servidor. A equipe não troca a agenda do profissional direto pelo navegador.
-- ---------------------------------------------------------------------
alter table public.google_accounts enable row level security;
revoke all on public.google_accounts from anon, authenticated;
grant select (id, clinic_id, email, status, last_error, created_at) on public.google_accounts to authenticated;

create policy "membros veem as contas do Google" on public.google_accounts
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));

revoke update on public.professionals from authenticated;
grant update (name, sort_order) on public.professionals to authenticated;
