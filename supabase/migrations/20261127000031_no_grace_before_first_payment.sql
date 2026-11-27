-- Tolerância só para quem já pagou.
--
-- Antes, uma cobrança recusada abria 3 dias de tolerância mesmo numa assinatura que nunca teve
-- um mês pago: quem tentava assinar com um cartão recusado ganhava acesso ao painel por 3 dias
-- sem pagar nada. Agora a tolerância só existe depois de um período pago (current_period_end
-- preenchido); na primeira cobrança recusada, a assinatura continua sem acesso.

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
    -- empurram o prazo de bloqueio para mais longe. E só para quem já teve um mês pago: a
    -- recusa da primeira cobrança não libera o painel.
    update public.subscriptions set
      grace_until = coalesce(grace_until, now() + interval '3 days')
    where id = p_subscription_id
      and current_period_end is not null;
  end if;

  return true;
end;
$$;


-- Desfaz a tolerância dada a assinaturas que nunca tiveram um mês pago (o acesso liberado pela
-- equipe tem current_period_end, então não é afetado).
update public.subscriptions
   set grace_until = null
 where current_period_end is null
   and grace_until is not null;
