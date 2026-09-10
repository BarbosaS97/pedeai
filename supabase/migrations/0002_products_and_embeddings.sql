-- 0002_products_and_embeddings.sql
-- Produtos do cardápio + coluna de embedding (pgvector, opcional).
--
-- NOTA: o garçom IA (Edge Function ai-waiter) atualmente NÃO usa busca
-- vetorial — a API pública da DeepSeek não tem endpoint de embeddings, então
-- o cardápio completo do restaurante é mandado direto no prompt. A coluna
-- `embedding`, o índice ivfflat e a função `match_products` abaixo ficam
-- criados (não fazem mal ficarem vazios/sem uso) para o dia em que você
-- quiser plugar um provedor de embeddings (ex: OpenAI) e voltar a fazer RAG.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  ingredients text[] not null default '{}',
  image_url text,
  is_available boolean not null default true,
  -- Coluna sem uso hoje (ver nota no topo do arquivo) — reservada para "nome +
  -- descrição + ingredientes" caso a busca vetorial seja reativada no futuro.
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_restaurant_id on public.products (restaurant_id);

-- Índice vetorial (busca aproximada por similaridade de cosseno) para o garçom IA.
create index if not exists idx_products_embedding on public.products
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.products enable row level security;

-- Leitura pública: o cardápio (/:slug) precisa listar produtos sem autenticação.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products for select
  using (true);

-- Escrita restrita ao token do restaurante (ver current_restaurant_token() em
-- 0001). Só quem possui a URL /r/:access_token consegue cadastrar/editar produtos.
drop policy if exists "products_insert_by_token" on public.products;
create policy "products_insert_by_token"
  on public.products for insert
  with check (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "products_update_by_token" on public.products;
create policy "products_update_by_token"
  on public.products for update
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

drop policy if exists "products_delete_by_token" on public.products;
create policy "products_delete_by_token"
  on public.products for delete
  using (
    restaurant_id in (
      select id from public.restaurants where access_token = public.current_restaurant_token()
    )
  );

-- Mantém updated_at em dia a cada edição do produto.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Não há trigger/webhook aqui chamando uma Edge Function de embeddings — o
-- projeto não usa mais uma função "generate-embedding" (removida: dependia de
-- embeddings da DeepSeek, que essa API não oferece). Se um dia você quiser
-- reativar a busca vetorial, essa seria a hora de recriar essa função e
-- configurar o Database Webhook equivalente (Dashboard → Database →
-- Webhooks), o que só funciona depois do primeiro webhook do projeto
-- provisionar o schema `supabase_functions`.

-- Função de busca vetorial (não usada pela ai-waiter atual — ver nota no topo
-- do arquivo). Fica pronta caso você reative embeddings no futuro: retorna os
-- produtos mais próximos semanticamente de um embedding de consulta,
-- filtrando pelo restaurante.
create or replace function public.match_products(
  query_embedding vector(1536),
  match_restaurant_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  name text,
  description text,
  price numeric,
  ingredients text[],
  similarity float
)
language sql
stable
as $$
  select
    p.id,
    p.name,
    p.description,
    p.price,
    p.ingredients,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.products p
  where p.restaurant_id = match_restaurant_id
    and p.is_available = true
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
