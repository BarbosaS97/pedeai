-- 0015_restaurant_auth.sql
-- Login de verdade pro painel do restaurante (Supabase Auth), no lugar do
-- "link com token".
--
-- Antes: quem tivesse a URL restaurante/index.html?token=... operava o
-- restaurante (policies "..._by_token", via header x-restaurant-token). Só que
-- restaurants.access_token é legível por qualquer pessoa (a leitura de
-- `restaurants` é pública — ver 0001), então o "segredo" nunca foi secreto.
--
-- Agora: cada restaurante tem um usuário do Supabase Auth
-- (restaurants.auth_user_id). O acesso provisório é criado pelo super admin
-- (Edge Function admin-generate-access) com app_metadata.must_reset = true;
-- enquanto essa flag estiver ligada o usuário NÃO enxerga/edita dados do
-- painel (só consegue concluir o primeiro acesso: trocar e-mail e senha).
-- Quem desliga a flag é a Edge Function restaurant-finish-setup, depois do
-- e-mail confirmado. app_metadata só é gravável com service_role, então o
-- próprio dono não consegue se "auto-liberar".
--
-- Links antigos (?token=) deixam de funcionar: cada restaurante existente
-- precisa de "Gerar acesso provisório" no admin.

alter table public.restaurants
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists idx_restaurants_auth_user_id
  on public.restaurants (auth_user_id) where auth_user_id is not null;

-- Restaurantes do usuário logado que já concluíram o primeiro acesso. Lê
-- auth.users (security definer) em vez de só o JWT pra que "gerar acesso
-- provisório" bloqueie o dono NA HORA, sem esperar o JWT antigo expirar.
create or replace function public.owned_restaurant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select r.id
  from public.restaurants r
  join auth.users u on u.id = r.auth_user_id
  where u.id = auth.uid()
    and coalesce(u.raw_app_meta_data ->> 'must_reset', 'false') <> 'true';
$$;

revoke all on function public.owned_restaurant_ids() from public;
grant execute on function public.owned_restaurant_ids() to anon, authenticated;

-- ---- products (0002) ----
drop policy if exists "products_insert_by_token" on public.products;
drop policy if exists "products_update_by_token" on public.products;
drop policy if exists "products_delete_by_token" on public.products;

drop policy if exists "products_insert_by_owner" on public.products;
create policy "products_insert_by_owner" on public.products for insert
  with check (restaurant_id in (select public.owned_restaurant_ids()));

drop policy if exists "products_update_by_owner" on public.products;
create policy "products_update_by_owner" on public.products for update
  using (restaurant_id in (select public.owned_restaurant_ids()))
  with check (restaurant_id in (select public.owned_restaurant_ids()));

drop policy if exists "products_delete_by_owner" on public.products;
create policy "products_delete_by_owner" on public.products for delete
  using (restaurant_id in (select public.owned_restaurant_ids()));

-- ---- orders / order_items (0003) ----
drop policy if exists "orders_select_by_token" on public.orders;
drop policy if exists "orders_update_by_token" on public.orders;
drop policy if exists "order_items_select_by_token" on public.order_items;

drop policy if exists "orders_select_by_owner" on public.orders;
create policy "orders_select_by_owner" on public.orders for select
  using (restaurant_id in (select public.owned_restaurant_ids()));

drop policy if exists "orders_update_by_owner" on public.orders;
create policy "orders_update_by_owner" on public.orders for update
  using (restaurant_id in (select public.owned_restaurant_ids()))
  with check (restaurant_id in (select public.owned_restaurant_ids()));

drop policy if exists "order_items_select_by_owner" on public.order_items;
create policy "order_items_select_by_owner" on public.order_items for select
  using (
    order_id in (
      select o.id from public.orders o
      where o.restaurant_id in (select public.owned_restaurant_ids())
    )
  );

-- ---- categories (0004) ----
drop policy if exists "categories_insert_by_token" on public.categories;
drop policy if exists "categories_update_by_token" on public.categories;
drop policy if exists "categories_delete_by_token" on public.categories;

drop policy if exists "categories_insert_by_owner" on public.categories;
create policy "categories_insert_by_owner" on public.categories for insert
  with check (restaurant_id in (select public.owned_restaurant_ids()));

drop policy if exists "categories_update_by_owner" on public.categories;
create policy "categories_update_by_owner" on public.categories for update
  using (restaurant_id in (select public.owned_restaurant_ids()))
  with check (restaurant_id in (select public.owned_restaurant_ids()));

drop policy if exists "categories_delete_by_owner" on public.categories;
create policy "categories_delete_by_owner" on public.categories for delete
  using (restaurant_id in (select public.owned_restaurant_ids()));

-- ---- storage: fotos de produtos (0003) e logos (0009) ----
-- Objetos ficam em <restaurant_id>/<arquivo>; só o dono mexe na própria pasta.
drop policy if exists "product_photos_insert_by_token" on storage.objects;
drop policy if exists "product_photos_update_by_token" on storage.objects;
drop policy if exists "product_photos_delete_by_token" on storage.objects;
drop policy if exists "restaurant_logos_insert_by_token" on storage.objects;
drop policy if exists "restaurant_logos_update_by_token" on storage.objects;
drop policy if exists "restaurant_logos_delete_by_token" on storage.objects;

drop policy if exists "product_photos_insert_by_owner" on storage.objects;
create policy "product_photos_insert_by_owner" on storage.objects for insert
  with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1] in (select id::text from public.owned_restaurant_ids() as id)
  );
drop policy if exists "product_photos_update_by_owner" on storage.objects;
create policy "product_photos_update_by_owner" on storage.objects for update
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] in (select id::text from public.owned_restaurant_ids() as id)
  );
drop policy if exists "product_photos_delete_by_owner" on storage.objects;
create policy "product_photos_delete_by_owner" on storage.objects for delete
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1] in (select id::text from public.owned_restaurant_ids() as id)
  );

drop policy if exists "restaurant_logos_insert_by_owner" on storage.objects;
create policy "restaurant_logos_insert_by_owner" on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select id::text from public.owned_restaurant_ids() as id)
  );
drop policy if exists "restaurant_logos_update_by_owner" on storage.objects;
create policy "restaurant_logos_update_by_owner" on storage.objects for update
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select id::text from public.owned_restaurant_ids() as id)
  );
drop policy if exists "restaurant_logos_delete_by_owner" on storage.objects;
create policy "restaurant_logos_delete_by_owner" on storage.objects for delete
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select id::text from public.owned_restaurant_ids() as id)
  );

-- current_restaurant_token() (0001) fica no banco por compatibilidade, mas
-- nenhuma policy usa mais. restaurants.access_token idem: não dá mais acesso
-- a nada e pode ser removido numa limpeza futura.
