-- 0006_order_customer_info.sql
-- Nome e telefone do cliente que fez o pedido, capturados na tela de
-- boas-vindas do cardápio público (cliente/cardapio.js) antes de mostrar o
-- cardápio. Guardados junto do pedido pra o restaurante saber quem chamar
-- quando ficar pronto (exibido no painel, ver restaurante/painel.js).
--
-- Colunas opcionais: pedidos antigos (de antes desta migration) continuam
-- válidos, só sem esses dados.
alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text;
