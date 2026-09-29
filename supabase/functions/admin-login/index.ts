// admin-login/index.ts
//
// Verifica a senha do super admin (admin/index.html) contra o secret
// SENHA_ADMIN, configurado nos secrets da Edge Function — nunca no
// frontend. O navegador manda só o que a pessoa digitou (+ o token do
// Cloudflare Turnstile) e recebe { ok: true/false } de volta, sem nunca ver
// (nem baixar) a senha real.
//
// Proteção contra força bruta, em 3 camadas (nesta ordem):
//   1. Bloqueio: 5 senhas erradas na mesma janela de 15 min, do mesmo IP,
//      bloqueiam esse IP por 15 min (429 com retry_after). Contadores em
//      public.auth_rate_limits (migration 0016). Não há limite "global" de
//      propósito: qualquer um poderia tentar de vários IPs só pra trancar o
//      dono pra fora — ataque distribuído é papel do Turnstile (etapa 2).
//   2. Turnstile: sem um token válido do Cloudflare (secret
//      TURNSTILE_SECRET_KEY), a senha nem é conferida (400 captcha_failed).
//      Isso NÃO conta como tentativa errada de senha.
//   3. Senha: comparação em tempo constante contra SENHA_ADMIN; erro conta
//      como falha, acerto zera os contadores do IP.
//
// Se TURNSTILE_SECRET_KEY NÃO estiver configurado, a etapa 2 é pulada (pra
// não trancar o admin logo após publicar a função) — configure o secret
// antes de considerar o login protegido. Ver README.
//
// Isso continua sendo só um gate de MVP, não autenticação de verdade: não há
// token de sessão assinado (o admin.js guarda só um "true" no sessionStorage
// depois do ok), e as policies de RLS de `restaurants` continuam permissivas
// pra anon key mesmo depois de logado (ver aviso na migration 0001 e no
// README).
//
// Request body: { senha: string, turnstile_token?: string }
// Response body: { ok: boolean, error?: 'captcha_failed' | 'rate_limited', retry_after?: number }
//
// Arquivo autocontido (sem imports de ../_shared/), mesmo padrão do
// ai-waiter — pra poder ser colado direto no editor de Edge Functions do
// Supabase Dashboard.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WINDOW_SECONDS = 15 * 60
const BLOCK_SECONDS = 15 * 60
const MAX_FAILURES_PER_IP = 5

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Comparação em tempo constante: uma comparação "==" normal para no primeiro
// caractere diferente, o que em teoria vaza (por timing) quantos caracteres
// do início a pessoa já acertou. Aqui sempre percorremos a string inteira,
// não expostos a esse tipo de vazamento por temporização de rede.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token })
  if (ip !== 'unknown') body.set('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
  const data = await res.json()
  return data.success === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { senha, turnstile_token } = await req.json()
    const expected = Deno.env.get('SENHA_ADMIN')

    // Secret não configurado no Supabase: nunca libera, mesmo por acidente
    // (ex: alguém mandar senha vazia e o secret também estar vazio/ausente).
    if (!expected) {
      throw new Error('SENHA_ADMIN não configurada nos secrets do Supabase')
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const ip = clientIp(req)
    const ipKey = `admin-login:ip:${ip}`

    // 1) Bloqueio ativo?
    const { data: ipBlocked } = await supabase.rpc('rate_limit_blocked_seconds', { p_key: ipKey })
    const retryAfter = Number(ipBlocked) || 0
    if (retryAfter > 0) {
      return json({ ok: false, error: 'rate_limited', retry_after: retryAfter }, 429)
    }

    // 2) Turnstile
    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY')
    if (turnstileSecret) {
      const valid =
        typeof turnstile_token === 'string' &&
        turnstile_token.length > 0 &&
        (await verifyTurnstile(turnstile_token, turnstileSecret, ip))
      if (!valid) return json({ ok: false, error: 'captcha_failed' }, 400)
    } else {
      console.warn('admin-login: TURNSTILE_SECRET_KEY não configurado — verificação de captcha desativada')
    }

    // 3) Senha
    const ok = typeof senha === 'string' && senha.length > 0 && timingSafeEqual(senha, expected)

    if (ok) {
      await supabase.rpc('rate_limit_reset', { p_key: ipKey })
      return json({ ok: true })
    }

    const { data: ipBlock } = await supabase.rpc('rate_limit_register_failure', {
      p_key: ipKey,
      p_max: MAX_FAILURES_PER_IP,
      p_window_seconds: WINDOW_SECONDS,
      p_block_seconds: BLOCK_SECONDS,
    })
    const blockedNow = Number(ipBlock) || 0
    if (blockedNow > 0) return json({ ok: false, error: 'rate_limited', retry_after: blockedNow }, 429)

    return json({ ok: false })
  } catch (err) {
    console.error('admin-login error:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
