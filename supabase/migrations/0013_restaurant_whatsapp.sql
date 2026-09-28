-- 0013_restaurant_whatsapp.sql
-- WhatsApp do restaurante (restaurants.whatsapp): coluna aditiva, opcional,
-- não quebra restaurantes existentes.
--
-- Guardado só como dígitos (DDD + número, 10 ou 11 dígitos, sem "+55") —
-- mesmo padrão de telefone usado no resto do app (ver maskPhone, js/util.js).
-- Cadastrado no admin (admin/admin.js, ao criar o restaurante ou depois, via
-- o modal "WhatsApp" na lista) e editável também pelo próprio restaurante
-- (restaurante/painel.js, seção "Identidade visual"). Usado pelo cardápio
-- público (cliente/cardapio.js) pra montar o link "https://wa.me/55<numero>"
-- do botão "Enviar pedido no WhatsApp" no carrinho — sem número cadastrado,
-- esse botão simplesmente não aparece.

alter table public.restaurants
  add column if not exists whatsapp text;

alter table public.restaurants
  drop constraint if exists restaurants_whatsapp_format;
alter table public.restaurants
  add constraint restaurants_whatsapp_format check (whatsapp is null or whatsapp ~ '^[0-9]{10,11}$');
