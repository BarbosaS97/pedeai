-- 0010_leads.sql
-- Leads da landing page (index.html): nome/telefone/email de quem preencheu
-- o formulário de contato, pra você (super admin) entrar em contato.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_created_at on public.leads (created_at desc);

alter table public.leads enable row level security;

-- Fluxo público, sem login: qualquer visitante da landing page pode enviar
-- o formulário (mesmo padrão de "orders_insert_public", migration 0003).
drop policy if exists "leads_insert_public" on public.leads;
create policy "leads_insert_public"
  on public.leads for insert
  with check (true);

-- ATENÇÃO (MVP sem login, mesmo aviso da migration 0001): não existe Supabase
-- Auth ainda, então a aba "Leads" do admin (admin/admin.js) usa a mesma anon
-- key pública de sempre pra listar os leads — e por isso a policy de leitura
-- abaixo é aberta pra essa key, protegida só pelo gate de senha no
-- FRONTEND (PEDEAI_CONFIG.ADMIN_PASSWORD), não pela RLS. Como o formulário
-- coleta nome/telefone/email (dados pessoais), isso é uma concessão
-- deliberada de MVP — antes de produção, migrar para Supabase Auth e
-- restringir esta policy a um papel "admin" autenticado.
drop policy if exists "leads_select_admin_mvp" on public.leads;
create policy "leads_select_admin_mvp"
  on public.leads for select
  using (true);
