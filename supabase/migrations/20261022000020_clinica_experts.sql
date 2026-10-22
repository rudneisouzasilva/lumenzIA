-- =====================================================================
-- LumenzIA — Clínica Experts conectado pela própria clínica
--
-- A clínica gera uma chave de API no Clínica Experts (Configurações > Integrações) e cola no
-- painel. A LumenzIA testa a chave na hora (lista os profissionais) e guarda no Vault. Depois a
-- clínica liga cada profissional da LumenzIA a um profissional do Clínica Experts, e um
-- profissional principal para quando a pessoa não escolhe. A assistente consulta os horários
-- livres, marca e cancela direto no Clínica Experts.
--
-- A agenda que a assistente usa continua sendo uma só (integrations.mode): Google, Clínica
-- Experts ou o webhook/API configurado pela equipe.
-- =====================================================================

alter type public.integration_mode add value if not exists 'clinica_experts';

-- ---------------------------------------------------------------------
-- 1. A conexão de cada clínica (a chave fica no Vault)
-- ---------------------------------------------------------------------
create table public.clinica_experts_accounts (
  clinic_id         uuid primary key references public.clinics (id) on delete cascade,
  api_key_secret_id uuid,
  status            text not null default 'ativo' check (status in ('ativo', 'desconectado')),
  last_error        text,
  connected_by      uuid references public.profiles (id) on delete set null,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger clinica_experts_accounts_set_updated_at before update on public.clinica_experts_accounts
  for each row execute function public.set_updated_at();

create function public.set_clinica_experts_key(p_clinic_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := 'clinica_experts:' || p_clinic_id;
begin
  select api_key_secret_id into v_secret_id
    from public.clinica_experts_accounts where clinic_id = p_clinic_id;
  if not found then
    raise exception 'conexão do Clínica Experts não encontrada: %', p_clinic_id;
  end if;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_key, v_name);
    update public.clinica_experts_accounts set api_key_secret_id = v_secret_id where clinic_id = p_clinic_id;
  else
    perform vault.update_secret(v_secret_id, p_key, v_name);
  end if;
end;
$$;

create function public.get_clinica_experts_key(p_clinic_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
    from public.clinica_experts_accounts a
    join vault.decrypted_secrets d on d.id = a.api_key_secret_id
   where a.clinic_id = p_clinic_id;
$$;

create function public.delete_clinica_experts_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.api_key_secret_id is not null then
    delete from vault.secrets where id = old.api_key_secret_id;
  end if;
  return old;
end;
$$;

create trigger clinica_experts_accounts_vault_cleanup after delete on public.clinica_experts_accounts
  for each row execute function public.delete_clinica_experts_vault_secret();

revoke execute on function public.set_clinica_experts_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_clinica_experts_key(uuid) from public, anon, authenticated;
revoke execute on function public.delete_clinica_experts_vault_secret() from public, anon, authenticated;
grant execute on function public.set_clinica_experts_key(uuid, text) to service_role;
grant execute on function public.get_clinica_experts_key(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. Qual profissional do Clínica Experts é cada profissional da LumenzIA
-- ---------------------------------------------------------------------
alter table public.professionals
  add column ce_professional_uuid text check (char_length(ce_professional_uuid) <= 100),
  add column ce_professional_name text not null default '' check (char_length(ce_professional_name) <= 200);

-- O principal: quando a pessoa não escolhe ou a clínica não cadastrou profissionais.
alter table public.integrations
  add column ce_professional_uuid text check (char_length(ce_professional_uuid) <= 100),
  add column ce_professional_name text not null default '' check (char_length(ce_professional_name) <= 200);

-- ---------------------------------------------------------------------
-- 3. Acesso: o painel vê se está conectado (sem a chave); conectar, escolher e desconectar
-- passam pelo servidor.
-- ---------------------------------------------------------------------
alter table public.clinica_experts_accounts enable row level security;
revoke all on public.clinica_experts_accounts from anon, authenticated;
grant select (clinic_id, status, last_error, connected_at) on public.clinica_experts_accounts to authenticated;

create policy "membros veem a conexão do Clínica Experts" on public.clinica_experts_accounts
  for select to authenticated using (public.is_clinic_member(clinic_id) or (select public.is_admin()));
