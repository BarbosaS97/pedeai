-- 0004_categories.sql
-- Categorias de cardápio (seções), criadas pelo restaurante para organizar os
-- produtos em grupos como "Entradas", "Pratos principais", "Bebidas" etc.
--
-- Um produto pode pertencer a no máximo uma categoria (category_id opcional).
-- Produto sem categoria (ou cuja categoria foi excluída) aparece agrupado em
-- "Outros" no cardápio público — isso é resolvido no frontend, não no banco.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  -- Ordem de exibição no cardápio (menor primeiro). Novas categorias entram
  -- no fim da lista; sem UI de reordenar por enquanto.
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_restaurant_id on public.categories (restaurant_id);

alter table public.categories enable row level security;

-- Leitura pública: o cardápio (/:slug) precisa listar as categorias sem autenticação.
drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public"
  on public.categories for select
  using (true);

-- Escrita restrita ao token do restaurante (mesmo padrão de products/orders,
-- ver current_restaurant_token() na migration 0001).
drop policy if exists "categories_insert_by_token" on public.categories;
create policy "categories_insert_by_token"
  on public.categories for insert
  with check (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "categories_update_by_token" on public.categories;
create policy "categories_update_by_token"
  on public.categories for update
  using (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  )
  with check (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "categories_delete_by_token" on public.categories;
create policy "categories_delete_by_token"
  on public.categories for delete
  using (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  );

-- Vínculo opcional do produto com uma categoria. on delete set null: excluir
-- uma categoria não apaga os produtos dela, só os deixa sem categoria.
alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists idx_products_category_id on public.products (category_id);
