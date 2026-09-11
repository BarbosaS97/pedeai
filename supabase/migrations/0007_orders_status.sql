-- 0007_orders_status.sql
-- Suporte à tela de cozinha (restaurante/cozinha): fluxo "recebido -> em
-- preparo -> pronto" com tempo decorrido por coluna.
--
-- O campo "status" já existe desde 0003_orders_and_storage.sql, com os
-- valores 'pending', 'preparing', 'ready', 'completed', 'cancelled' (em
-- inglês, para seguir a convenção do resto do schema — id, restaurant_id,
-- created_at etc.). Mapeiam 1:1 para o fluxo da cozinha: 'pending' = pedido
-- recebido (coluna esquerda), 'preparing' = em preparo (coluna direita),
-- 'ready' = pronto (sai da tela, vai pro histórico). Não é preciso trocar
-- esses valores nem a constraint — a tela de cozinha e a aba "Pedidos" do
-- painel (restaurante/painel.js) passam a operar sobre o mesmo campo.
--
-- O que falta pra a tela funcionar bem:
--   1) Um "updated_at" que marque quando o pedido entrou no status atual —
--      é o que a cozinha usa pra calcular "há quanto tempo esse pedido está
--      nessa coluna" e colorir o card (cinza/amarelo/vermelho).
--   2) Um índice que cubra a query da tela (pedidos de um restaurante,
--      filtrados por status).

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

-- Mantém updated_at em dia sozinho a cada UPDATE (ex: quando a cozinha muda
-- o status), sem depender de todo caller lembrar de setar o campo na mão.
create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_orders_updated_at();

-- Query da tela de cozinha é sempre "pedidos deste restaurante com tal
-- status" (coluna esquerda: pending: coluna direita: preparing) — índice
-- composto cobre esse filtro diretamente.
create index if not exists idx_orders_restaurant_status on public.orders (restaurant_id, status);

-- RLS: nenhuma policy nova é necessária aqui. "orders_select_by_token" e
-- "orders_update_by_token" (migration 0003) já liberam, para quem tem o
-- token do restaurante, ler e atualizar (incluindo o status) apenas os
-- pedidos do próprio restaurante_id; "orders_insert_public" já deixa o
-- cliente anônimo (cardápio) criar pedidos só para restaurantes ativos, sem
-- exigir token. A tela de cozinha reusa exatamente esse mesmo client
-- autenticado por token (createRestaurantClient), então herda essas regras.
