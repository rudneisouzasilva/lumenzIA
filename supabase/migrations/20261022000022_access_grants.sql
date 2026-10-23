-- =====================================================================
-- LumenzIA — acesso liberado pela equipe (demonstração / cortesia)
--
-- A equipe libera, na aba Acessos do /admin, um plano por um período para uma clínica, sem passar
-- pelo Mercado Pago. É uma assinatura comum (o resto do sistema já entende), marcada como
-- cortesia: sem renovação, sem cobrança, termina sozinha no fim do período.
-- =====================================================================

alter table public.subscriptions
  add column is_grant   boolean not null default false,
  add column granted_by uuid references public.profiles (id) on delete set null,
  add column grant_note text check (char_length(grant_note) <= 300);

create index subscriptions_grants_idx on public.subscriptions (created_at desc) where is_grant;

-- ---------------------------------------------------------------------
-- A clínica que assina durante a cortesia não perde os dias que faltavam: o primeiro período pago
-- começa quando a cortesia terminaria, e a cortesia se encerra ali mesmo (fica uma assinatura só).
-- ---------------------------------------------------------------------
create or replace function public.apply_subscription_payment(
  p_subscription_id     uuid,
  p_provider_payment_id text,
  p_amount_cents        integer,
  p_approved            boolean
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_inserted  integer;
  v_clinic_id uuid;
  v_grant_end timestamptz;
begin
  -- Idempotente: a mesma cobrança reenviada pelo webhook bate no índice único e não faz nada.
  insert into public.payments (subscription_id, provider_payment_id, amount_cents, status)
  values (
    p_subscription_id,
    p_provider_payment_id,
    coalesce(p_amount_cents, 0),
    case when p_approved then 'approved' else 'rejected' end::public.payment_status
  )
  on conflict (provider_payment_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  if p_approved then
    select s.clinic_id into v_clinic_id
      from public.subscriptions s
     where s.id = p_subscription_id and not s.is_grant;

    if v_clinic_id is not null then
      select max(g.current_period_end) into v_grant_end
        from public.subscriptions g
       where g.clinic_id = v_clinic_id and g.is_grant and g.current_period_end > now();
      if v_grant_end is not null then
        update public.subscriptions g set current_period_end = now()
         where g.clinic_id = v_clinic_id and g.is_grant and g.current_period_end > now();
      end if;
    end if;

    -- O novo período começa de onde o atual termina (ou agora, se já venceu): uma cobrança que
    -- chega um pouco atrasada não faz perder dias já pagos.
    update public.subscriptions set
      status                    = 'authorized',
      current_period_start      = coalesce(current_period_start, now()),
      current_period_end        = greatest(coalesce(current_period_end, now()), now(),
                                           coalesce(v_grant_end, now())) + interval '30 days',
      grace_until               = null,
      messages_used_this_period = 0,
      quota_alert_sent_at       = null
    where id = p_subscription_id;
  else
    -- Só a primeira recusa do ciclo abre a tolerância: as novas tentativas do Mercado Pago não
    -- empurram o prazo de bloqueio para mais longe.
    update public.subscriptions set
      grace_until = coalesce(grace_until, now() + interval '3 days')
    where id = p_subscription_id;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de clientes do /admin: diz se o acesso em vigor é cortesia
-- ---------------------------------------------------------------------
drop function public.admin_clinics();

create function public.admin_clinics()
returns table (
  id                     uuid,
  name                   text,
  created_at             timestamptz,
  is_active              boolean,
  whatsapp_phone_number_id text,
  whatsapp_display_phone text,
  owner_name             text,
  owner_email            text,
  owner_phone            text,
  members                bigint,
  plan_name              text,
  subscription_status    public.subscription_status,
  current_period_end     timestamptz,
  grace_until            timestamptz,
  messages_used          integer,
  message_quota          integer,
  last_message_at        timestamptz,
  is_grant               boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso restrito à equipe LumenzIA' using errcode = '42501';
  end if;

  return query
  select c.id, c.name, c.created_at, c.is_active, c.whatsapp_phone_number_id,
         c.whatsapp_display_phone,
         owner.full_name, owner.email::text, owner.phone,
         (select count(*) from public.clinic_members m where m.clinic_id = c.id),
         sub.plan_name, sub.status, sub.current_period_end, sub.grace_until,
         sub.messages_used_this_period, sub.message_quota,
         (select max(cv.last_message_at) from public.conversations cv where cv.clinic_id = c.id),
         sub.is_grant
    from public.clinics c
    left join lateral (
      select p.full_name, u.email, p.phone
        from public.clinic_members m
        join public.profiles p on p.id = m.user_id
        join auth.users u on u.id = m.user_id
       where m.clinic_id = c.id and m.role = 'owner'
       order by m.created_at
       limit 1
    ) owner on true
    -- A assinatura que vale por mais tempo; sem nenhuma em dia, a mais recente.
    left join lateral (
      select pl.name as plan_name, s.status, s.current_period_end, s.grace_until,
             s.messages_used_this_period, pl.message_quota, s.is_grant
        from public.subscriptions s
        join public.plans pl on pl.id = s.plan_id
       where s.clinic_id = c.id
       order by greatest(coalesce(s.current_period_end, '-infinity'),
                         coalesce(s.grace_until, '-infinity')) desc,
                s.created_at desc
       limit 1
    ) sub on true
   order by c.created_at desc;
end;
$$;

revoke execute on function public.admin_clinics() from public, anon;
grant execute on function public.admin_clinics() to authenticated, service_role;
