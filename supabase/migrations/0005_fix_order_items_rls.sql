-- 0005_fix_order_items_rls.sql
-- Corrige um bug de RLS em "order_items_insert_public" (migration 0003).
--
-- A policy original checava se o pedido pertencia a um restaurante ativo
-- fazendo um JOIN direto com "orders":
--
--   order_id in (
--     select o.id from public.orders o
--     join public.restaurants r on r.id = o.restaurant_id
--     where r.is_active = true
--   )
--
-- O problema: "orders" tem RLS e só é visível via SELECT pra quem tem o
-- token do restaurante (orders_select_by_token). Um cliente anônimo criando
-- um pedido não tem esse token — então, do ponto de vista dele, esse JOIN
-- sempre retorna vazio (não porque o pedido não exista, mas porque ele não
-- tem permissão de "ver" nem o pedido que ele mesmo acabou de criar). Isso
-- fazia o insert de order_items ser negado sempre, pra todo cliente.
--
-- A correção usa uma função SECURITY DEFINER: ela roda com o privilégio de
-- quem a criou, então o SELECT em "orders" dentro dela não passa pelo RLS de
-- quem está chamando — exatamente o mesmo princípio de current_restaurant_token()
-- (migration 0001), que também precisa "furar" a bolha do chamador pra ler o
-- header da request.
create or replace function public.order_belongs_to_active_restaurant(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.id = p_order_id
      and r.is_active = true
  );
$$;

drop policy if exists "order_items_insert_public" on public.order_items;
create policy "order_items_insert_public"
  on public.order_items for insert
  with check (
    public.order_belongs_to_active_restaurant(order_id)
  );
