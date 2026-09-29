-- 0016_auth_rate_limits.sql
-- Limite de tentativas de senha (anti força-bruta) das Edge Functions
-- admin-login e admin-generate-access.
--
-- Cada "chave" (ex: 'admin-login:ip:203.0.113.7') acumula falhas dentro de uma
-- janela; ao atingir o máximo, fica bloqueada por um tempo. Sucesso zera.
--
-- Só a service_role (Edge Functions) acessa: RLS ligado sem nenhuma policy e
-- funções sem execute pra anon/authenticated — o navegador não consegue
-- nem ler nem zerar contadores.
--
-- (O login do restaurante NÃO passa por aqui: usa Supabase Auth com CAPTCHA
-- nativo e os rate limits do próprio Auth — ver README, "Turnstile e limite
-- de tentativas".)

create table if not exists public.auth_rate_limits (
  key text primary key,
  failures int not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.auth_rate_limits enable row level security;

-- Segundos restantes de bloqueio (0 = liberado).
create or replace function public.rate_limit_blocked_seconds(p_key text)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select ceil(extract(epoch from (blocked_until - now())))::int
       from public.auth_rate_limits
      where key = p_key and blocked_until > now()),
    0
  );
$$;

-- Registra uma falha. Devolve os segundos de bloqueio (0 = ainda não bloqueou).
create or replace function public.rate_limit_register_failure(
  p_key text,
  p_max int,
  p_window_seconds int,
  p_block_seconds int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failures int;
  v_blocked timestamptz;
begin
  -- limpeza oportunista de linhas velhas e sem bloqueio ativo
  delete from public.auth_rate_limits
   where window_started_at < now() - interval '1 day'
     and (blocked_until is null or blocked_until < now());

  insert into public.auth_rate_limits as l (key, failures, window_started_at)
  values (p_key, 1, now())
  on conflict (key) do update
    set failures = case
          when l.window_started_at + make_interval(secs => p_window_seconds) < now() then 1
          else l.failures + 1
        end,
        window_started_at = case
          when l.window_started_at + make_interval(secs => p_window_seconds) < now() then now()
          else l.window_started_at
        end,
        blocked_until = case
          when l.window_started_at + make_interval(secs => p_window_seconds) < now() then null
          else l.blocked_until
        end
  returning failures into v_failures;

  if v_failures >= p_max then
    v_blocked := now() + make_interval(secs => p_block_seconds);
    update public.auth_rate_limits set blocked_until = v_blocked where key = p_key;
    return p_block_seconds;
  end if;
  return 0;
end;
$$;

create or replace function public.rate_limit_reset(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_rate_limits where key = p_key;
$$;

revoke all on function public.rate_limit_blocked_seconds(text) from public, anon, authenticated;
revoke all on function public.rate_limit_register_failure(text, int, int, int) from public, anon, authenticated;
revoke all on function public.rate_limit_reset(text) from public, anon, authenticated;
grant execute on function public.rate_limit_blocked_seconds(text) to service_role;
grant execute on function public.rate_limit_register_failure(text, int, int, int) to service_role;
grant execute on function public.rate_limit_reset(text) to service_role;
