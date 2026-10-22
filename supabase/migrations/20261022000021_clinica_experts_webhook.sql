-- =====================================================================
-- LumenzIA — avisos em tempo real do Clínica Experts (webhook)
--
-- Cada clínica ganha um endereço exclusivo, com um código secreto no final, que ela cadastra na
-- tela de webhooks do Clínica Experts. A cada agendamento criado, alterado, remarcado ou
-- cancelado lá, o Clínica Experts avisa esse endereço e a LumenzIA atualiza na hora a cópia
-- local (a que os lembretes usam). O código identifica a clínica e impede avisos falsos: a
-- documentação deles não fala em assinatura.
-- =====================================================================

alter table public.clinica_experts_accounts
  add column webhook_token   text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  add column last_webhook_at timestamptz;

-- O painel mostra quando chegou o último aviso (o código continua só no servidor).
grant select (last_webhook_at) on public.clinica_experts_accounts to authenticated;
