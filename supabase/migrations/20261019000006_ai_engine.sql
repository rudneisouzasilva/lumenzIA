-- =====================================================================
-- LumenzIA — motor da IA no WhatsApp
--
-- Funções chamadas pelo servidor (chave secreta) no webhook do WhatsApp.
-- =====================================================================

-- Conta uma resposta da IA na cota do ciclo. Um "update ... + 1" no banco, e não ler e gravar no
-- servidor, para duas mensagens processadas ao mesmo tempo não contarem como uma.
create function public.count_ai_message(p_subscription_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.subscriptions
     set messages_used_this_period = messages_used_this_period + 1
   where id = p_subscription_id;
$$;

revoke execute on function public.count_ai_message(uuid) from public, anon, authenticated;
grant execute on function public.count_ai_message(uuid) to service_role;

