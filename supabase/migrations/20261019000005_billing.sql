-- =====================================================================
-- LumenzIA — cobrança da assinatura
--
-- Aplica numa única transação o resultado de uma cobrança (aprovada ou recusada) à assinatura.
-- Quem chama é o servidor, com a chave secreta: o webhook do Mercado Pago e, no modo de teste,
-- o botão "Confirmar pagamento de teste".
-- =====================================================================

-- Ciclo de 30 dias contado a partir da cobrança aprovada; 3 dias de tolerância após uma recusada.
create function public.apply_subscription_payment(
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
  v_inserted integer;
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
    -- O novo período começa de onde o atual termina (ou agora, se já venceu): uma cobrança que
    -- chega um pouco atrasada não faz perder dias já pagos.
    update public.subscriptions set
      status                    = 'authorized',
      current_period_start      = coalesce(current_period_start, now()),
      current_period_end        = greatest(coalesce(current_period_end, now()), now()) + interval '30 days',
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

revoke execute on function public.apply_subscription_payment(uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_payment(uuid, text, integer, boolean)
  to service_role;
