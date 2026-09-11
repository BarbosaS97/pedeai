-- 0008_mesas.sql
-- Mesas do restaurante + QR Code por mesa: o super admin decide quantas
-- mesas existem, gera os QR Codes (cada um aponta pra
-- cliente/index.html?slug=X&mesa=Y) e imprime pra colar nas molduras do
-- salão. O cardápio valida a mesa (existe? está ativa?) antes de deixar o
-- cliente pedir.

create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  -- Nota: a tabela de restaurantes deste projeto chama-se "restaurants"
  -- (inglês, mesma convenção do resto do schema — id/name/slug/created_at),
  -- não "restaurantes".
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  numero text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurant_id, numero)
);

create index if not exists idx_mesas_restaurant_id on public.mesas (restaurant_id);

alter table public.mesas enable row level security;

-- Leitura pública (mesmo padrão de "restaurants_select_public" e
-- "products_select_public", migrations 0001/0002): não há Supabase Auth
-- neste MVP, então não existe como a policy de RLS diferenciar "o admin
-- lendo" de "um cliente anônimo lendo" — ambos batem na API com a mesma
-- anon key. A regra de negócio real ("cliente só pode pedir em mesa ativa")
-- é aplicada na aplicação (cliente/cardapio.js confere `ativo` antes de
-- liberar o cardápio), não escondida via RLS — do mesmo jeito que
-- "products_select_public" já expõe produtos indisponíveis e o app filtra
-- por is_available na hora de montar a query.
drop policy if exists "mesas_select_public" on public.mesas;
create policy "mesas_select_public"
  on public.mesas for select
  using (true);

-- Escrita (gerar, renomear, ativar/desativar, excluir mesas) é feita pelo
-- admin (admin/index.html) — mesmo aviso de segurança das policies
-- "restaurants_insert_admin_mvp"/"restaurants_update_admin_mvp" (migration
-- 0001): a única proteção hoje é o gate de senha no frontend, não Supabase
-- Auth. Antes de produção, mover para trás de auth de verdade ou de uma
-- Edge Function com service_role.
drop policy if exists "mesas_insert_admin_mvp" on public.mesas;
create policy "mesas_insert_admin_mvp"
  on public.mesas for insert
  with check (true);

drop policy if exists "mesas_update_admin_mvp" on public.mesas;
create policy "mesas_update_admin_mvp"
  on public.mesas for update
  using (true)
  with check (true);

drop policy if exists "mesas_delete_admin_mvp" on public.mesas;
create policy "mesas_delete_admin_mvp"
  on public.mesas for delete
  using (true);

-- orders.table_number era "int" (migration 0003), pensado só pra números de
-- mesa simples. Agora o admin pode renomear uma mesa pra um rótulo livre
-- (ex: "8 — Varanda"), e o pedido precisa guardar esse rótulo exatamente
-- como está na mesa (mesmo princípio de "snapshot" já usado em
-- order_items.product_name — o texto do pedido não deve mudar se a mesa for
-- renomeada depois). "using table_number::text" preserva os pedidos
-- antigos, só convertendo o número existente pra texto.
alter table public.orders
  alter column table_number type text using table_number::text;
