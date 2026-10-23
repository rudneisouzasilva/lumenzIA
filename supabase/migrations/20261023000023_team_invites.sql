-- =====================================================================
-- LumenzIA — equipe com acesso só às telas escolhidas pela dona
--
-- A dona da conta convida uma pessoa pela tela "Minha conta e equipe": escolhe as telas (áreas)
-- que ela pode abrir e manda o link. Quem abre o link cria a conta (ou entra na que já tem) e
-- passa a fazer parte da clínica só com essas áreas. A dona continua vendo tudo.
--
-- O site confere as áreas em cada página e em cada ação; aqui o banco confere de novo nas
-- tabelas que a equipe altera direto, para que ninguém contorne o painel.
-- =====================================================================

-- null = todas as áreas (a dona, e quem já era da equipe antes desta migração)
alter table public.clinic_members
  add column permissions text[];

-- ---------------------------------------------------------------------
-- Convites. O link leva um código aleatório; aqui fica só o hash dele.
-- ---------------------------------------------------------------------
create table public.clinic_invites (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 120),
  email       text not null check (char_length(email) <= 254),
  permissions text[] not null default '{}',
  token_hash  text not null unique,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

create index clinic_invites_clinic_idx on public.clinic_invites (clinic_id, created_at desc);

alter table public.clinic_invites enable row level security;

-- Só a dona vê os convites (o código nunca sai do servidor: só o hash fica guardado).
create function public.is_clinic_owner(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- A pessoa logada pode mexer nesta área da clínica?
create function public.member_can(p_clinic_id uuid, p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id
      and m.user_id = (select auth.uid())
      and (m.role = 'owner' or m.permissions is null or p_area = any (m.permissions))
  );
$$;

revoke execute on function public.is_clinic_owner(uuid) from public, anon;
revoke execute on function public.member_can(uuid, text) from public, anon;
grant execute on function public.is_clinic_owner(uuid) to authenticated, service_role;
grant execute on function public.member_can(uuid, text) to authenticated, service_role;

grant select (id, clinic_id, full_name, email, permissions, created_at, expires_at, accepted_at)
  on public.clinic_invites to authenticated;
create policy "a dona vê os convites" on public.clinic_invites
  for select to authenticated using (public.is_clinic_owner(clinic_id));

-- ---------------------------------------------------------------------
-- Escrita direta da equipe: só na área liberada
-- ---------------------------------------------------------------------
-- Ler continua valendo para toda a equipe (as telas cruzam dados); criar, alterar e apagar só
-- com a área liberada.
do $$
declare
  t record;
  extra text;
begin
  for t in
    select * from (values
      ('faqs',            'membros gerenciam faqs',               'conhecimento'),
      ('ai_questions',    'membros gerenciam perguntas da IA',    'roteiro'),
      ('contact_reasons', 'membros gerenciam motivos de contato', 'relatorios'),
      ('services',        'membros gerenciam procedimentos',      'procedimentos'),
      ('professionals',   'membros gerenciam profissionais',      'profissionais'),
      ('images',          'membros gerenciam fotos',              'conhecimento')
    ) as v (tbl, old_policy, area)
  loop
    extra := case when t.tbl = 'images'
                  then $x$ and storage_path like clinic_id::text || '/%'$x$ else '' end;
    execute format('drop policy %I on public.%I', t.old_policy, t.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.is_clinic_member(clinic_id) or (select public.is_admin()))',
      'membros veem ' || t.tbl, t.tbl);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.member_can(clinic_id, %L)%s)',
      'equipe cria ' || t.tbl, t.tbl, t.area, extra);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.member_can(clinic_id, %L))
         with check (public.member_can(clinic_id, %L)%s)',
      'equipe altera ' || t.tbl, t.tbl, t.area, t.area, extra);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.member_can(clinic_id, %L))',
      'equipe apaga ' || t.tbl, t.tbl, t.area);
  end loop;
end;
$$;

drop policy "membros escolhem o lembrete" on public.integrations;
create policy "membros escolhem o lembrete" on public.integrations
  for update to authenticated
  using (public.member_can(clinic_id, 'avisos')) with check (public.member_can(clinic_id, 'avisos'));

drop policy "membros assumem ou devolvem conversas" on public.conversations;
create policy "membros assumem ou devolvem conversas" on public.conversations
  for update to authenticated
  using (public.member_can(clinic_id, 'conversas')) with check (public.member_can(clinic_id, 'conversas'));

drop policy "membros editam os contatos" on public.contacts;
create policy "membros editam os contatos" on public.contacts
  for update to authenticated
  using (public.member_can(clinic_id, 'funil') or public.member_can(clinic_id, 'conversas'))
  with check (public.member_can(clinic_id, 'funil') or public.member_can(clinic_id, 'conversas'));

drop policy "membros criam etapas" on public.pipeline_stages;
drop policy "membros alteram etapas" on public.pipeline_stages;
drop policy "membros apagam etapas" on public.pipeline_stages;
create policy "membros criam etapas" on public.pipeline_stages
  for insert to authenticated with check (public.member_can(clinic_id, 'funil'));
create policy "membros alteram etapas" on public.pipeline_stages
  for update to authenticated using (public.member_can(clinic_id, 'funil'))
  with check (public.member_can(clinic_id, 'funil'));
create policy "membros apagam etapas" on public.pipeline_stages
  for delete to authenticated using (public.member_can(clinic_id, 'funil'));

drop policy "membros criam motivos de perda" on public.lost_reasons;
drop policy "membros alteram motivos de perda" on public.lost_reasons;
drop policy "membros apagam motivos de perda" on public.lost_reasons;
create policy "membros criam motivos de perda" on public.lost_reasons
  for insert to authenticated with check (public.member_can(clinic_id, 'funil'));
create policy "membros alteram motivos de perda" on public.lost_reasons
  for update to authenticated using (public.member_can(clinic_id, 'funil'))
  with check (public.member_can(clinic_id, 'funil'));
create policy "membros apagam motivos de perda" on public.lost_reasons
  for delete to authenticated using (public.member_can(clinic_id, 'funil'));

drop policy "membros enviam fotos da clínica" on storage.objects;
drop policy "membros alteram fotos da clínica" on storage.objects;
drop policy "membros apagam fotos da clínica" on storage.objects;
create policy "membros enviam fotos da clínica" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clinic-images' and public.member_can(public.storage_clinic_id(name), 'conhecimento'));
create policy "membros alteram fotos da clínica" on storage.objects
  for update to authenticated
  using (bucket_id = 'clinic-images' and public.member_can(public.storage_clinic_id(name), 'conhecimento'));
create policy "membros apagam fotos da clínica" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-images' and public.member_can(public.storage_clinic_id(name), 'conhecimento'));

-- ---------------------------------------------------------------------
-- Tela Equipe: a dona vê o e-mail de login de cada pessoa (fica em auth.users)
-- ---------------------------------------------------------------------
create function public.clinic_member_emails(p_clinic_id uuid)
returns table (
  user_id         uuid,
  full_name       text,
  email           text,
  role            public.member_role,
  permissions     text[],
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_clinic_owner(p_clinic_id) then
    raise exception 'só a dona da conta vê a equipe' using errcode = '42501';
  end if;

  return query
  select m.user_id, p.full_name, u.email::text, m.role, m.permissions, m.created_at,
         u.last_sign_in_at
    from public.clinic_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
   where m.clinic_id = p_clinic_id
   order by m.role, m.created_at;
end;
$$;

revoke execute on function public.clinic_member_emails(uuid) from public, anon;
grant execute on function public.clinic_member_emails(uuid) to authenticated, service_role;
