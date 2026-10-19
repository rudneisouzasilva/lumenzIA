-- =====================================================================
-- Fotos (Storage), segredos (Vault) e tempo real (Realtime)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage: bucket público "clinic-images"
-- Público para leitura porque o WhatsApp precisa baixar a foto por URL; os nomes de arquivo são
-- aleatórios. Escrever só pode quem é membro da clínica dona da pasta {clinic_id}/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-images', 'clinic-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create function public.storage_clinic_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy "membros enviam fotos da clínica" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clinic-images' and public.is_clinic_member(public.storage_clinic_id(name)));
create policy "membros alteram fotos da clínica" on storage.objects
  for update to authenticated
  using (bucket_id = 'clinic-images' and public.is_clinic_member(public.storage_clinic_id(name)));
create policy "membros apagam fotos da clínica" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-images' and public.is_clinic_member(public.storage_clinic_id(name)));

-- ---------------------------------------------------------------------
-- Vault: token do WhatsApp e chave da agenda de cada clínica
-- Só o servidor (service_role) grava e lê. kind = 'whatsapp_token' | 'agenda_api_key'.
-- ---------------------------------------------------------------------
create function public.set_clinic_secret(p_clinic_id uuid, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := 'clinic:' || p_clinic_id || ':' || p_kind;
begin
  if p_kind not in ('whatsapp_token', 'agenda_api_key') then
    raise exception 'tipo de segredo inválido: %', p_kind;
  end if;

  select case p_kind when 'whatsapp_token' then s.whatsapp_token_secret_id else s.agenda_api_key_secret_id end
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
  else
    update public.clinic_secrets set agenda_api_key_secret_id = v_secret_id where clinic_id = p_clinic_id;
  end if;
end;
$$;

create function public.get_clinic_secret(p_clinic_id uuid, p_kind text)
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
                          when 'agenda_api_key' then s.agenda_api_key_secret_id end
  where s.clinic_id = p_clinic_id;
$$;

revoke execute on function public.set_clinic_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_clinic_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.set_clinic_secret(uuid, text, text) to service_role;
grant execute on function public.get_clinic_secret(uuid, text) to service_role;

-- Apagar a clínica apaga também os segredos dela no Vault
create function public.delete_clinic_vault_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets
  where id in (old.whatsapp_token_secret_id, old.agenda_api_key_secret_id);
  return old;
end;
$$;

revoke execute on function public.delete_clinic_vault_secrets() from public, anon, authenticated;

create trigger clinic_secrets_vault_cleanup after delete on public.clinic_secrets
  for each row execute function public.delete_clinic_vault_secrets();

-- ---------------------------------------------------------------------
-- Realtime: a fila de atendimento e o histórico atualizam sozinhos no painel
-- (o Realtime respeita o RLS: cada clínica recebe só as próprias linhas)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.conversations, public.messages;
