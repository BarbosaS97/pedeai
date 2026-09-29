-- 0014_category_icon.sql
-- Ícone da categoria (categories.icon): coluna aditiva, opcional, não quebra
-- categorias existentes. Guarda só a CHAVE do ícone escolhido pelo dono no
-- painel (ex: 'pizza', 'burger' — ver js/category-icons.js), nunca o SVG.
-- Null = "automático": o cardápio escolhe o ícone pela palavra-chave do nome
-- da categoria, como antes (categoryStyle em cliente/cardapio.js).
--
-- Sem policy nova: as de update/insert por token (migration 0004) já cobrem
-- a coluna nova.

alter table public.categories
  add column if not exists icon text;
