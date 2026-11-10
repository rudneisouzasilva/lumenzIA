-- =====================================================================
-- LumenzIA — até 5 WhatsApps da equipe
--
--   clinics.staff_phone_numbers: os WhatsApps que recebem os avisos à equipe (até 5). A
--     assistente não responde mensagens que chegam deles.
--   clinics.staff_last_inbound:  { "<número>": "<quando escreveu por último>" }, para mandar o
--     aviso como mensagem comum (sem custo de modelo) dentro da janela de 24 horas da Meta.
--
-- clinics.staff_phone_number (um número só) deixa de ser usado; fica até a próxima limpeza.
-- Pode rodar de novo sem problema.
-- =====================================================================

alter table public.clinics
  add column if not exists staff_phone_numbers text[] not null default '{}'
    check (cardinality(staff_phone_numbers) <= 5),
  add column if not exists staff_last_inbound jsonb not null default '{}'::jsonb;

update public.clinics
   set staff_phone_numbers = array[staff_phone_number]
 where staff_phone_number is not null
   and staff_phone_numbers = '{}';

grant update (staff_phone_numbers) on public.clinics to authenticated;
