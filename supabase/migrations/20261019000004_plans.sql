-- Planos iniciais (mesmos do Lumia), por volume de mensagens da IA por mês. Para mudar nome,
-- preço ou cota depois, edite as linhas de public.plans no painel do Supabase.
insert into public.plans (code, name, description, price_cents, message_quota, features, highlight, sort_order)
values
  (
    'plano-500',
    'Plano 500',
    'Ideal para começar: uma assistente no WhatsApp da sua clínica, configurada por você.',
    19700,
    500,
    '["Até 500 mensagens da IA por mês","Atendimento no WhatsApp 24 horas","Respostas com base nas suas perguntas frequentes","Envio das fotos que você aprovar","Perguntas de qualificação definidas por você","Histórico de conversas no painel"]',
    false,
    1
  ),
  (
    'plano-1500',
    'Plano 1500',
    'Para clínicas com volume maior de atendimento no WhatsApp.',
    39700,
    1500,
    '["Até 1.500 mensagens da IA por mês","Tudo do Plano 500","Aprende com conversas reais da sua clínica","Agenda integrada com lembrete automático"]',
    true,
    2
  ),
  (
    'plano-3000',
    'Plano 3000',
    'Para quem atende um volume alto de pacientes todos os meses.',
    69700,
    3000,
    '["Até 3.000 mensagens da IA por mês","Tudo do Plano 1500","Prioridade no suporte"]',
    false,
    3
  );
