-- =====================================================================
-- LumenzIA — a equipe só altera, nas configurações da clínica, a parte que a dona liberou
--
-- O painel já confere a área de cada pessoa antes de salvar. Mas a tabela clinics aceitava
-- alteração de qualquer pessoa da equipe direto pela API do Supabase (com o login dela), em
-- qualquer coluna liberada: quem só tinha "Funil" conseguia trocar o nome da clínica, o e-mail que
-- recebe os avisos ou desligar a assistente. Aqui o banco confere de novo, coluna por coluna,
-- com as mesmas áreas do painel (src/lib/painel/areas.ts).
--
-- O servidor (chave secreta) não passa por esta regra. Também apaga clinics.staff_phone_number,
-- que deixou de ser usado na migração 0027 (o número já foi copiado para staff_phone_numbers).
-- Pode rodar de novo sem problema.
-- =====================================================================

create or replace function public.clinic_update_by_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Só quem entra pelo painel com o próprio login é conferido.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.name is distinct from old.name
     and not public.is_clinic_owner(old.id) then
    raise exception 'só a dona da conta muda o nome da clínica' using errcode = '42501';
  end if;

  if (new.assistant_name, new.tone, new.business_info, new.behavior_rules,
      new.conversation_timeout_hours)
     is distinct from
     (old.assistant_name, old.tone, old.business_info, old.behavior_rules,
      old.conversation_timeout_hours)
     and not public.member_can(old.id, 'assistente') then
    raise exception 'sem acesso a Personalidade' using errcode = '42501';
  end if;

  if new.past_conversations is distinct from old.past_conversations
     and not public.member_can(old.id, 'conhecimento') then
    raise exception 'sem acesso a Conhecimento' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and not (public.member_can(old.id, 'assistente') or public.member_can(old.id, 'whatsapp')) then
    raise exception 'sem acesso para ligar ou desligar a assistente' using errcode = '42501';
  end if;

  if (new.work_days, new.work_hours_start, new.work_hours_end, new.works_on_holidays,
      new.extra_closed_dates)
     is distinct from
     (old.work_days, old.work_hours_start, old.work_hours_end, old.works_on_holidays,
      old.extra_closed_dates)
     and not public.member_can(old.id, 'horarios') then
    raise exception 'sem acesso a Horários' using errcode = '42501';
  end if;

  if (new.require_evaluation, new.evaluation_validity_days)
     is distinct from (old.require_evaluation, old.evaluation_validity_days)
     and not public.member_can(old.id, 'procedimentos') then
    raise exception 'sem acesso a Procedimentos' using errcode = '42501';
  end if;

  if new.booking_fields is distinct from old.booking_fields
     and not public.member_can(old.id, 'roteiro') then
    raise exception 'sem acesso a Roteiro de atendimento' using errcode = '42501';
  end if;

  if (new.followup_abandoned_days, new.followup_concluded_days, new.followup_max_attempts)
     is distinct from
     (old.followup_abandoned_days, old.followup_concluded_days, old.followup_max_attempts)
     and not (public.member_can(old.id, 'retomadas') or public.member_can(old.id, 'funil')) then
    raise exception 'sem acesso a Retomadas' using errcode = '42501';
  end if;

  if (new.staff_phone_numbers, new.staff_alert_channels, new.staff_alert_email,
      new.reminder_by_email)
     is distinct from
     (old.staff_phone_numbers, old.staff_alert_channels, old.staff_alert_email,
      old.reminder_by_email)
     and not public.member_can(old.id, 'avisos') then
    raise exception 'sem acesso a Lembretes e avisos' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.clinic_update_by_area() from public, anon, authenticated;

drop trigger if exists clinics_update_by_area on public.clinics;
create trigger clinics_update_by_area
  before update on public.clinics
  for each row execute function public.clinic_update_by_area();

-- Número único da equipe: substituído por staff_phone_numbers (migração 0027).
alter table public.clinics drop column if exists staff_phone_number;
