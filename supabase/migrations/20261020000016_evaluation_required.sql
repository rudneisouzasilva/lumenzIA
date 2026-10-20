-- =====================================================================
-- LumenzIA — avaliação obrigatória antes de procedimentos
--
-- Cada item de "Procedimentos" tem um tipo:
--  - "avaliacao": a consulta de avaliação;
--  - "procedimento": só pode ser agendado depois de uma avaliação, quando a clínica exige;
--  - "livre": nunca exige avaliação (ex.: limpeza de pele).
-- Com a exigência ligada, a IA só agenda um "procedimento" para quem já fez uma avaliação (data
-- passada e não cancelada) e, se houver prazo, só até N dias depois dela. A busca usa o registro
-- de agendamentos, que guarda 13 meses; por isso o prazo vai até 365 dias.
-- =====================================================================

alter table public.services
  add column kind text not null default 'procedimento'
    check (kind in ('avaliacao', 'procedimento', 'livre'));

-- Itens que já se chamam "Avaliação..." passam a ser do tipo avaliação.
update public.services set kind = 'avaliacao' where name ilike 'avalia%';

alter table public.clinics
  add column require_evaluation       boolean not null default false,
  add column evaluation_validity_days smallint check (evaluation_validity_days between 1 and 365); -- null = sem prazo

grant update (require_evaluation, evaluation_validity_days) on public.clinics to authenticated;

-- A busca da última avaliação de um contato.
create index appointment_log_contact_starts_idx on public.appointment_log (contact_id, starts_at desc);
