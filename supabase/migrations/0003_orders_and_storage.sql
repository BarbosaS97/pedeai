-- 0003_orders_and_storage.sql
-- Pedidos + itens do pedido + bucket de Storage para fotos de produtos.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_number int,
  status text not null default 'pending'
    check (status in ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  total numeric(10, 2) not null default 0,
  customer_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_restaurant_id on public.orders (restaurant_id);
create index if not exists idx_orders_created_at on public.orders (created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- snapshot do nome/preço no momento do pedido (produto pode mudar depois)
  product_name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Cliente final cria pedidos livremente (fluxo público, sem login) — mas só pode
-- inserir para um restaurante ativo existente.
drop policy if exists "orders_insert_public" on public.orders;
create policy "orders_insert_public"
  on public.orders for insert
  with check (
    restaurant_id in (select id from public.restaurants where is_active = true)
  );

-- Ver pedidos é restrito ao token do restaurante (painel /r/:access_token).
drop policy if exists "orders_select_by_token" on public.orders;
create policy "orders_select_by_token"
  on public.orders for select
  using (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  );

-- Restaurante atualiza status do pedido (ex: pending -> preparing -> ready).
drop policy if exists "orders_update_by_token" on public.orders;
create policy "orders_update_by_token"
  on public.orders for update
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

-- order_items segue a mesma regra do pedido pai (join por order_id).
drop policy if exists "order_items_insert_public" on public.order_items;
create policy "order_items_insert_public"
  on public.order_items for insert
  with check (
    order_id in (
      select o.id from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where r.is_active = true
    )
  );

drop policy if exists "order_items_select_by_token" on public.order_items;
create policy "order_items_select_by_token"
  on public.order_items for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where r.access_token = public.current_restaurant_token()
    )
  );

-- Realtime: permite que o painel do restaurante assine INSERTs em orders/order_items.
-- "alter publication ... add table" não tem IF NOT EXISTS, então checamos antes
-- (pg_publication_tables) para a migration poder ser rodada mais de uma vez sem erro.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

-- Storage: bucket "products" para fotos de produtos.
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

-- Leitura pública das fotos (necessário para exibir no cardápio).
drop policy if exists "product_photos_select_public" on storage.objects;
create policy "product_photos_select_public"
  on storage.objects for select
  using (bucket_id = 'products');

-- Upload/edição só para quem tem o token do restaurante. Convenção de path:
-- products/{restaurant_id}/{arquivo}. Validamos que o primeiro segmento do path
-- corresponde a um restaurante cujo access_token bate com o header enviado.
drop policy if exists "product_photos_insert_by_token" on storage.objects;
create policy "product_photos_insert_by_token"
  on storage.objects for insert
  with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1] in (
      select id::text from public.restaurants
      where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "product_photos_update_by_token" on storage.objects;
create policy "product_photos_update_by_token"
  on storage.objects for update
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] in (
      select id::text from public.restaurants
      where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "product_photos_delete_by_token" on storage.objects;
create policy "product_photos_delete_by_token"
  on storage.objects for delete
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] in (
      select id::text from public.restaurants
      where access_token = public.current_restaurant_token()
    )
  );
