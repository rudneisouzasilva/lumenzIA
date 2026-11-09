-- WhatsApp pelo app da própria clínica
-- ---------------------------------------------------------------------
-- Enquanto a LumenzIA não é Tech Provider da Meta, uma clínica que já tem app e número na Cloud
-- API (no Gerenciador de Negócios dela) liga o WhatsApp pelo /admin: Phone Number ID, WABA,
-- token de usuário do sistema e a Chave Secreta do app dela. A chave confere a assinatura dos
-- avisos que o app da clínica manda para o nosso webhook; fica no Vault, como o token.

alter table public.clinic_secrets add column whatsapp_app_secret_secret_id uuid;

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
  if p_kind not in ('whatsapp_token', 'agenda_api_key', 'whatsapp_pin', 'whatsapp_app_secret') then
    raise exception 'tipo de segredo inválido: %', p_kind;
  end if;

  select case p_kind when 'whatsapp_token' then s.whatsapp_token_secret_id
                     when 'agenda_api_key' then s.agenda_api_key_secret_id
                     when 'whatsapp_pin' then s.whatsapp_pin_secret_id
                     else s.whatsapp_app_secret_secret_id end
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
  elsif p_kind = 'whatsapp_pin' then
    update public.clinic_secrets set whatsapp_pin_secret_id = v_secret_id where clinic_id = p_clinic_id;
  else
    update public.clinic_secrets set whatsapp_app_secret_secret_id = v_secret_id where clinic_id = p_clinic_id;
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
                          when 'whatsapp_pin' then s.whatsapp_pin_secret_id
                          when 'whatsapp_app_secret' then s.whatsapp_app_secret_secret_id end
  where s.clinic_id = p_clinic_id;
$$;

create or replace function public.delete_clinic_vault_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets
  where id in (old.whatsapp_token_secret_id, old.agenda_api_key_secret_id,
               old.whatsapp_pin_secret_id, old.whatsapp_app_secret_secret_id);
  return old;
end;
$$;

create or replace function public.clinic_secret_status(p_clinic_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'whatsapp_token',      s.whatsapp_token_secret_id is not null,
    'agenda_api_key',      s.agenda_api_key_secret_id is not null,
    'whatsapp_pin',        s.whatsapp_pin_secret_id is not null,
    'whatsapp_app_secret', s.whatsapp_app_secret_secret_id is not null
  )
  from public.clinic_secrets s
  where s.clinic_id = p_clinic_id;
$$;

revoke execute on function public.set_clinic_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_clinic_secret(uuid, text) from public, anon, authenticated;
revoke execute on function public.delete_clinic_vault_secrets() from public, anon, authenticated;
revoke execute on function public.clinic_secret_status(uuid) from public, anon, authenticated;
grant execute on function public.set_clinic_secret(uuid, text, text) to service_role;
grant execute on function public.get_clinic_secret(uuid, text) to service_role;
grant execute on function public.clinic_secret_status(uuid) to service_role;
