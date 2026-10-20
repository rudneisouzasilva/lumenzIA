-- =====================================================================
-- LumenzIA — dados que a IA pede no agendamento
--
-- O nome completo é sempre pedido e o telefone vem do próprio WhatsApp. Além deles, a clínica
-- escolhe se a IA pede e-mail, CPF e data de nascimento (desligado, opcional ou obrigatório) e
-- pode criar até 3 campos próprios de texto (ex.: "Alergias", "Convênio"):
--
--   clinics.booking_fields = {
--     "email": "desligado" | "opcional" | "obrigatorio",
--     "cpf": ..., "data_nascimento": ...,
--     "personalizados": [{ "nome": "Alergias", "obrigatorio": true }]
--   }
--
-- O que a pessoa informou fica no agendamento (appointments.patient_data) e no contato
-- (contacts.patient_data), para a IA não perguntar de novo da próxima vez. Nada disso vai para o
-- registro de análise (appointment_log), que continua sem dados pessoais.
-- =====================================================================

alter table public.clinics
  add column booking_fields jsonb not null
    default '{"email": "desligado", "cpf": "desligado", "data_nascimento": "desligado", "personalizados": []}'
    check (jsonb_typeof(booking_fields) = 'object');

grant update (booking_fields) on public.clinics to authenticated;

-- { "email", "cpf" (só dígitos), "data_nascimento" (AAAA-MM-DD), "campos": { "Alergias": "..." } }
alter table public.appointments
  add column patient_data jsonb not null default '{}' check (jsonb_typeof(patient_data) = 'object');

alter table public.contacts
  add column patient_data jsonb not null default '{}' check (jsonb_typeof(patient_data) = 'object');

-- Cada agendamento com dados atualiza o contato: o mais novo vale, e os campos próprios são
-- somados (um campo que a clínica tirou não apaga o que já foi informado).
create function public.appointment_patient_data_to_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is not null and new.patient_data <> '{}'::jsonb then
    update public.contacts
       set patient_data = (patient_data || (new.patient_data - 'campos'))
         || case
              when new.patient_data ? 'campos' then jsonb_build_object(
                'campos', coalesce(patient_data -> 'campos', '{}'::jsonb) || (new.patient_data -> 'campos'))
              else '{}'::jsonb
            end
     where id = new.contact_id;
  end if;
  return null;
end;
$$;

create trigger appointments_patient_data_to_contact after insert on public.appointments
  for each row execute function public.appointment_patient_data_to_contact();
