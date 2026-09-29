-- 0017_usage_analytics.sql
-- Métricas de uso por restaurante pro portal mestre (aba "Análise"):
--   - ai_usage    : tokens da IA (DeepSeek) gastos em cada mensagem do garçom
--                   (gravada pela Edge Function ai-waiter, service_role).
--   - menu_events : aberturas do cardápio (gravada pelo próprio cardápio, anon).
--   - admin_analytics(from, to): agrega tudo (+ produtos, categorias, mesas,
--                   pedidos) num JSON só; só a service_role executa — quem
--                   chama é a Edge Function admin-stats, depois de validar o
--                   token de sessão do admin.
--
-- As duas tabelas começam vazias: os números só existem a partir do momento
-- em que a migration + as funções/cardápio novos entram no ar.

-- ---------------- ai_usage ----------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  -- parte de prompt_tokens que veio do cache do provedor (mais barata)
  cache_hit_tokens int not null default 0,
  -- chamadas à API nessa mensagem (1, ou 2 se precisou repetir por resposta inválida)
  api_calls int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_restaurant_created on public.ai_usage (restaurant_id, created_at desc);
create index if not exists idx_ai_usage_created on public.ai_usage (created_at desc);

-- Só a service_role (Edge Functions) lê e escreve: RLS ligado, nenhuma policy.
alter table public.ai_usage enable row level security;

-- ---------------- menu_events ----------------
create table if not exists public.menu_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  event_type text not null check (event_type in ('menu_open')),
  -- id aleatório guardado no navegador do cliente (sem dado pessoal), só pra
  -- contar visitantes únicos
  visitor_id text not null check (char_length(visitor_id) <= 64),
  mesa text check (mesa is null or char_length(mesa) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists idx_menu_events_restaurant_created on public.menu_events (restaurant_id, created_at desc);

alter table public.menu_events enable row level security;

-- O cardápio público (anon) só INSERE, e só pra restaurante ativo; ninguém
-- lê pelo navegador. Métrica "macia": qualquer um pode inflar aberturas
-- chamando a API, então serve pra acompanhar uso, não pra cobrança.
-- Atenção: o insert do cliente NÃO pode usar .select()/RETURNING (exigiria
-- policy de leitura) — ver a "pegadinha de RLS + RETURNING" no README.
drop policy if exists "menu_events_insert_public" on public.menu_events;
create policy "menu_events_insert_public"
  on public.menu_events for insert
  with check (
    restaurant_id in (select id from public.restaurants where is_active = true)
  );

-- ---------------- admin_analytics ----------------
-- p_from/p_to: datas (inclusive nas duas pontas), interpretadas no fuso de
-- São Paulo. Devolve:
--   { restaurants: [ {id, name, slug, is_active, created_at, has_access, ...métricas} ],
--     daily: { "<restaurant_id>": [ {d, opens, msgs, tokens}, ... ] } }
create or replace function public.admin_analytics(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo') as t_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as t_to
  ),
  prod as (
    select restaurant_id, count(*) as total, count(*) filter (where is_available) as available
      from products group by 1
  ),
  cat as (select restaurant_id, count(*) as n from categories group by 1),
  mes as (
    select restaurant_id, count(*) as total, count(*) filter (where ativo) as active
      from mesas group by 1
  ),
  ord as (
    select o.restaurant_id,
           count(*) filter (where o.status <> 'cancelled') as n,
           coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as revenue,
           count(*) filter (where o.status = 'cancelled') as cancelled
      from orders o, bounds b
     where o.created_at >= b.t_from and o.created_at < b.t_to
     group by 1
  ),
  views as (
    select e.restaurant_id, count(*) as opens, count(distinct e.visitor_id) as visitors
      from menu_events e, bounds b
     where e.event_type = 'menu_open' and e.created_at >= b.t_from and e.created_at < b.t_to
     group by 1
  ),
  ai as (
    select u.restaurant_id,
           count(*) as messages,
           coalesce(sum(u.prompt_tokens), 0) as prompt,
           coalesce(sum(u.completion_tokens), 0) as completion,
           coalesce(sum(u.total_tokens), 0) as total,
           coalesce(sum(u.cache_hit_tokens), 0) as cache_hit
      from ai_usage u, bounds b
     where u.created_at >= b.t_from and u.created_at < b.t_to
     group by 1
  ),
  last_act as (
    select restaurant_id, max(ts) as ts from (
      select restaurant_id, max(created_at) as ts from menu_events group by 1
      union all select restaurant_id, max(created_at) from orders group by 1
      union all select restaurant_id, max(created_at) from ai_usage group by 1
    ) x group by 1
  ),
  daily as (
    select restaurant_id, d, sum(opens)::int as opens, sum(msgs)::int as msgs, sum(tokens)::bigint as tokens
      from (
        select e.restaurant_id, (e.created_at at time zone 'America/Sao_Paulo')::date as d,
               1 as opens, 0 as msgs, 0 as tokens
          from menu_events e, bounds b
         where e.event_type = 'menu_open' and e.created_at >= b.t_from and e.created_at < b.t_to
        union all
        select u.restaurant_id, (u.created_at at time zone 'America/Sao_Paulo')::date,
               0, 1, u.total_tokens
          from ai_usage u, bounds b
         where u.created_at >= b.t_from and u.created_at < b.t_to
      ) x
     group by 1, 2
  )
  select jsonb_build_object(
    'restaurants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'slug', r.slug,
          'is_active', r.is_active,
          'created_at', r.created_at,
          'has_access', r.auth_user_id is not null,
          'products', coalesce(prod.total, 0),
          'products_available', coalesce(prod.available, 0),
          'categories', coalesce(cat.n, 0),
          'mesas', coalesce(mes.total, 0),
          'mesas_active', coalesce(mes.active, 0),
          'orders', coalesce(ord.n, 0),
          'orders_cancelled', coalesce(ord.cancelled, 0),
          'revenue', coalesce(ord.revenue, 0),
          'opens', coalesce(views.opens, 0),
          'visitors', coalesce(views.visitors, 0),
          'ai_messages', coalesce(ai.messages, 0),
          'ai_prompt_tokens', coalesce(ai.prompt, 0),
          'ai_completion_tokens', coalesce(ai.completion, 0),
          'ai_total_tokens', coalesce(ai.total, 0),
          'ai_cache_hit_tokens', coalesce(ai.cache_hit, 0),
          'last_activity', last_act.ts
        )
        order by r.name
      )
      from restaurants r
      left join prod on prod.restaurant_id = r.id
      left join cat on cat.restaurant_id = r.id
      left join mes on mes.restaurant_id = r.id
      left join ord on ord.restaurant_id = r.id
      left join views on views.restaurant_id = r.id
      left join ai on ai.restaurant_id = r.id
      left join last_act on last_act.restaurant_id = r.id
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_object_agg(restaurant_id, series)
      from (
        select restaurant_id::text as restaurant_id,
               jsonb_agg(jsonb_build_object('d', d, 'opens', opens, 'msgs', msgs, 'tokens', tokens) order by d) as series
          from daily group by restaurant_id
      ) t
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.admin_analytics(date, date) from public, anon, authenticated;
grant execute on function public.admin_analytics(date, date) to service_role;
