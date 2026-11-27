-- =====================================================================
-- LumenzIA — pausar a assistente só no WhatsApp ou só no Instagram
--
-- clinics.is_active continua sendo o botão geral (liga/desliga tudo). As duas colunas novas
-- deixam a clínica pausar um canal e manter o outro: com o canal pausado, as mensagens dele
-- continuam chegando na caixa de entrada para a equipe responder.
-- Quem pode ligar/desligar é quem já podia mexer no botão geral (áreas Assistente ou WhatsApp).
-- Pode rodar de novo sem problema.
-- =====================================================================

alter table public.clinics
  add column if not exists whatsapp_ai_active  boolean not null default true,
  add column if not exists instagram_ai_active boolean not null default true;

grant update (whatsapp_ai_active, instagram_ai_active) on public.clinics to authenticated;

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

  if (new.is_active, new.whatsapp_ai_active, new.instagram_ai_active)
     is distinct from
     (old.is_active, old.whatsapp_ai_active, old.instagram_ai_active)
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
