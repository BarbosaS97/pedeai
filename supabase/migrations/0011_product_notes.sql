-- 0011_product_notes.sql
-- Duas colunas aditivas em `products` (não quebram produtos existentes):
--
-- - `notas_restaurante`: texto livre que o restaurante cadastra pra explicar
--   algo sobre o prato que o Ari (garçom IA) precisa saber pra responder
--   dúvida do cliente ou recomendar direito (ex: "contém glúten", "servido
--   frio", "não dá pra tirar a cebola"). Diferente de `ingredients` (lista
--   estruturada, mostrada no cardápio) e da observação do CLIENTE no
--   carrinho (`order_items.notes`, migration 0003) — esse campo aqui nunca
--   aparece pro cliente, só é lido pela Edge Function `ai-waiter` como
--   contexto extra do produto (ver ai-waiter/index.ts, buildSystemPrompt).
--
-- - `destaque`: quando true, o produto entra no bloco "Destaques da casa" no
--   topo do cardápio público (acima das categorias). Limitado a 3 por
--   restaurante — ver trigger abaixo, que é a validação de verdade (a
--   validação no painel, restaurante/painel.js, é só UX; sem o trigger dava
--   pra burlar o limite com duas abas abertas ao mesmo tempo).

alter table public.products
  add column if not exists notas_restaurante text,
  add column if not exists destaque boolean not null default false;

alter table public.products
  drop constraint if exists products_notas_restaurante_length;
alter table public.products
  add constraint products_notas_restaurante_length check (char_length(notas_restaurante) <= 300);

-- Trava o limite de 3 produtos em destaque por restaurante no banco, não só
-- no frontend — mesmo padrão de "nunca confiar só na camada de cima" usado
-- pro garçom IA (ai-waiter valida toda ação antes de aplicar).
create or replace function public.enforce_max_destaque_products()
returns trigger
language plpgsql
as $$
begin
  if new.destaque = true and (tg_op = 'INSERT' or old.destaque is distinct from true) then
    if (
      select count(*) from public.products
      where restaurant_id = new.restaurant_id
        and destaque = true
        and id <> new.id
    ) >= 3 then
      raise exception 'Limite de 3 produtos em destaque por restaurante atingido.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_max_destaque on public.products;
create trigger trg_products_max_destaque
  before insert or update on public.products
  for each row execute function public.enforce_max_destaque_products();
