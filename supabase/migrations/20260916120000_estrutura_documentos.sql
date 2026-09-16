-- Estrutura do controle de documentos (procedimentos Rumo)
-- Acesso restrito: somente e-mails em private.usuarios_autorizados leem/alteram dados.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Controle de acesso
-- ---------------------------------------------------------------------------
create table private.usuarios_autorizados (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now()
);

insert into private.usuarios_autorizados (email) values ('erwin.klein@ext.rumolog.com');

create or replace function private.is_autorizado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.usuarios_autorizados u
    where u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_autorizado() from public, anon;
grant execute on function private.is_autorizado() to authenticated;

-- Impede a criação de qualquer conta cujo e-mail não esteja autorizado
create or replace function private.bloquear_cadastro_nao_autorizado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.usuarios_autorizados u
    where u.email = lower(coalesce(new.email, ''))
  ) then
    raise exception 'Cadastro não autorizado para este e-mail';
  end if;
  return new;
end;
$$;

revoke all on function private.bloquear_cadastro_nao_autorizado() from public, anon, authenticated;

create trigger bloquear_cadastro_nao_autorizado
  before insert or update of email on auth.users
  for each row execute function private.bloquear_cadastro_nao_autorizado();

-- ---------------------------------------------------------------------------
-- Tipos de documento
-- ---------------------------------------------------------------------------
create table public.tipos_documento (
  sigla text primary key,
  nome text not null,
  sigla_antiga text,
  controla_vencimento boolean not null default true,
  ordem int not null default 0
);

insert into public.tipos_documento (sigla, nome, sigla_antiga, controla_vencimento, ordem) values
  ('PO',  'Procedimento Operacional',            'PRO', true,  1),
  ('ES',  'Especificação Técnica de Serviço',    'ETS', true,  2),
  ('EM',  'Especificação Técnica de Material',   'ETM', true,  3),
  ('AL',  'Alerta Técnico',                      'ALR', true,  4),
  ('FO',  'Formulário',                          'FRM', true,  5),
  ('MN',  'Manual',                              'MTE', true,  6),
  ('PGP', 'Padrão Gerencial de Processo',        'PGP', true,  7),
  ('RTE', 'Relatório Técnico de Engenharia',     null,  false, 8),
  ('IN',  'Informativo',                         'INF', false, 9),
  ('PT',  'Parecer Técnico',                     null,  false, 10),
  ('IT',  'Instrução de Trabalho',               null,  false, 11),
  ('OUT', 'Outros',                              null,  false, 99);

-- ---------------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------------
create table public.documentos (
  id bigint generated always as identity primary key,
  codigo text,
  tipo text references public.tipos_documento (sigla) on update cascade,
  numero text,
  revisao text,
  titulo text not null,
  disciplina text,
  data_atualizacao date,
  data_vencimento date,
  status_normativo text,
  vigente boolean not null default true,
  link_pdf text,
  link_editavel text,
  observacoes text,
  origem text not null default 'manual',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index documentos_tipo_idx on public.documentos (tipo);
create index documentos_vencimento_idx on public.documentos (data_vencimento);
create index documentos_codigo_idx on public.documentos (codigo);

create or replace function private.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger documentos_atualizado_em
  before update on public.documentos
  for each row execute function private.tocar_atualizado_em();

-- Histórico de alterações feitas pelo site
create table public.documentos_historico (
  id bigint generated always as identity primary key,
  documento_id bigint,
  acao text not null,
  alterado_por text,
  alterado_em timestamptz not null default now(),
  dados_anteriores jsonb,
  dados_novos jsonb
);

create index documentos_historico_doc_idx on public.documentos_historico (documento_id, alterado_em desc);

create or replace function private.registrar_historico_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.documentos_historico (documento_id, acao, alterado_por, dados_anteriores, dados_novos)
  values (
    coalesce(new.id, old.id),
    lower(tg_op),
    auth.jwt() ->> 'email',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.registrar_historico_documento() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visão com a situação calculada (janela de "próximo ao vencimento" = 60 dias)
-- ---------------------------------------------------------------------------
create view public.vw_documentos
with (security_invoker = true) as
select
  d.*,
  t.nome as tipo_nome,
  coalesce(t.controla_vencimento, false) as controla_vencimento,
  case
    when not coalesce(t.controla_vencimento, false) then 'Sem vencimento'
    when d.data_vencimento is null then 'Sem data'
    when d.data_vencimento < current_date then 'Vencido'
    when d.data_vencimento <= current_date + 60 then 'Próximo ao vencimento'
    else 'Válido'
  end as situacao,
  (d.data_vencimento - current_date) as dias_para_vencer
from public.documentos d
left join public.tipos_documento t on t.sigla = d.tipo;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tipos_documento enable row level security;
alter table public.documentos enable row level security;
alter table public.documentos_historico enable row level security;

revoke all on public.tipos_documento, public.documentos, public.documentos_historico, public.vw_documentos from anon;

create policy "autorizado le tipos" on public.tipos_documento
  for select to authenticated using ((select private.is_autorizado()));
create policy "autorizado altera tipos" on public.tipos_documento
  for all to authenticated using ((select private.is_autorizado())) with check ((select private.is_autorizado()));

create policy "autorizado le documentos" on public.documentos
  for select to authenticated using ((select private.is_autorizado()));
create policy "autorizado insere documentos" on public.documentos
  for insert to authenticated with check ((select private.is_autorizado()));
create policy "autorizado altera documentos" on public.documentos
  for update to authenticated using ((select private.is_autorizado())) with check ((select private.is_autorizado()));
create policy "autorizado exclui documentos" on public.documentos
  for delete to authenticated using ((select private.is_autorizado()));

create policy "autorizado le historico" on public.documentos_historico
  for select to authenticated using ((select private.is_autorizado()));
