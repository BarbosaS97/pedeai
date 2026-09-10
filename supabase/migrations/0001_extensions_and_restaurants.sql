-- 0001_extensions_and_restaurants.sql
-- Extensões necessárias + tabela de restaurantes (tenants da plataforma)

create extension if not exists "pgcrypto";  -- gen_random_uuid(), gen_random_bytes()
create extension if not exists "vector";    -- pgvector, usado pelo garçom IA

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- access_token é a "senha" do restaurante: URL /r/:access_token dá acesso ao painel.
  -- Gerado automaticamente e pode ser revogado/regenerado pelo super admin.
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurants_slug on public.restaurants (slug);
create index if not exists idx_restaurants_access_token on public.restaurants (access_token);

alter table public.restaurants enable row level security;

-- Helper: lê o header customizado "x-restaurant-token" enviado pelo painel do restaurante.
-- O Supabase (PostgREST) expõe os headers da requisição via a GUC "request.headers".
-- Não há Supabase Auth nesta versão (MVP sem login), então usamos esse token como
-- credencial de posse: quem tem a URL /r/:access_token consegue operar sobre o
-- restaurante correspondente.
create or replace function public.current_restaurant_token()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-restaurant-token', '');
$$;

-- Leitura pública: necessária para resolver /:slug (cardápio) e para a listagem do admin.
drop policy if exists "restaurants_select_public" on public.restaurants;
create policy "restaurants_select_public"
  on public.restaurants for select
  using (true);

-- ATENÇÃO (MVP sem login): não existe Supabase Auth ainda, então a proteção de
-- /admin é apenas um gate de senha no FRONTEND (VITE_ADMIN_PASSWORD). A anon key
-- usada pelo painel admin é a mesma exposta publicamente, então tecnicamente
-- qualquer pessoa com a anon key poderia inserir/atualizar restaurantes chamando a
-- API do Supabase diretamente. Antes de produção, migrar para Supabase Auth e
-- restringir estas policies a um papel "admin" autenticado (ou mover estas
-- operações para uma Edge Function com service_role key).
drop policy if exists "restaurants_insert_admin_mvp" on public.restaurants;
create policy "restaurants_insert_admin_mvp"
  on public.restaurants for insert
  with check (true);

drop policy if exists "restaurants_update_admin_mvp" on public.restaurants;
create policy "restaurants_update_admin_mvp"
  on public.restaurants for update
  using (true)
  with check (true);
