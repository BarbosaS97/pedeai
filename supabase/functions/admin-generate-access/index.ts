// admin-generate-access/index.ts
//
// "Gerar acesso provisório" do super admin (admin/index.html): cria — ou
// recria, se o restaurante já tem login — o usuário do Supabase Auth do
// restaurante com um login e uma senha provisórios, e devolve as
// credenciais UMA vez pro admin repassar ao dono.
//
// Exige a senha do super admin em CADA chamada (o admin digita de novo no
// modal), comparada com o secret SENHA_ADMIN — mesma verificação do
// admin-login, inclusive o limite de tentativas por IP (5 erros/15 min →
// bloqueio de 15 min, migration 0016): sem isso este endpoint seria uma
// segunda porta pra adivinhar a senha. Usa a service_role key (só existe
// aqui, no servidor) pra mexer no Supabase Auth.
//
// O login provisório é o slug do restaurante, convertido num e-mail sintético
// "<slug>@acesso.papeiai.com.br" (o Supabase Auth só entende e-mail; o
// painel converte o que a pessoa digita — sem "@" — do mesmo jeito, ver
// restaurante/auth.js). Nunca é enviado e-mail pra esse endereço.
//
// Se o restaurante já tinha e-mail/senha próprios, eles são SUBSTITUÍDOS:
// o dono precisa refazer o primeiro acesso (novo e-mail + nova senha).
//
// Request body: { senha: string, restaurant_id: string }
// Response body: { ok: true, login, password } | { ok: false, error, retry_after? }
//
// Arquivo autocontido (sem imports de ../_shared/), mesmo padrão das outras
// funções.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SYNTHETIC_DOMAIN = 'acesso.papeiai.com.br'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const WINDOW_SECONDS = 15 * 60
const BLOCK_SECONDS = 15 * 60
const MAX_FAILURES_PER_IP = 5

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  )
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Sem caracteres ambíguos (0/O, 1/l/I) — a senha é lida/copiada por humanos.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

function generatePassword(groups = 3, groupSize = 4): string {
  const bytes = new Uint8Array(groups * groupSize)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length])
  const out: string[] = []
  for (let g = 0; g < groups; g++) out.push(chars.slice(g * groupSize, (g + 1) * groupSize).join(''))
  return out.join('-')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { senha, restaurant_id } = await req.json()

    const expected = Deno.env.get('SENHA_ADMIN')
    if (!expected) throw new Error('SENHA_ADMIN não configurada nos secrets do Supabase')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Compartilha o contador do admin-login: errar a senha aqui também conta.
    const ipKey = `admin-login:ip:${clientIp(req)}`
    const { data: blocked } = await supabase.rpc('rate_limit_blocked_seconds', { p_key: ipKey })
    if (Number(blocked) > 0) {
      return json({ ok: false, error: 'Muitas tentativas. Tente de novo mais tarde.', retry_after: Number(blocked) }, 429)
    }

    if (typeof senha !== 'string' || senha.length === 0 || !timingSafeEqual(senha, expected)) {
      const { data: nowBlocked } = await supabase.rpc('rate_limit_register_failure', {
        p_key: ipKey,
        p_max: MAX_FAILURES_PER_IP,
        p_window_seconds: WINDOW_SECONDS,
        p_block_seconds: BLOCK_SECONDS,
      })
      if (Number(nowBlocked) > 0) {
        return json({ ok: false, error: 'Muitas tentativas. Tente de novo mais tarde.', retry_after: Number(nowBlocked) }, 429)
      }
      return json({ ok: false, error: 'Senha de admin incorreta.' }, 401)
    }
    await supabase.rpc('rate_limit_reset', { p_key: ipKey })

    if (typeof restaurant_id !== 'string' || !restaurant_id) {
      return json({ ok: false, error: 'restaurant_id é obrigatório.' }, 400)
    }

    const { data: restaurant, error: findError } = await supabase
      .from('restaurants')
      .select('id, slug, auth_user_id')
      .eq('id', restaurant_id)
      .maybeSingle()
    if (findError) throw findError
    if (!restaurant) return json({ ok: false, error: 'Restaurante não encontrado.' }, 404)

    const login = restaurant.slug
    const email = `${login}@${SYNTHETIC_DOMAIN}`
    const password = generatePassword()
    const app_metadata = { must_reset: true, restaurant_id: restaurant.id }

    if (restaurant.auth_user_id) {
      // Já tem usuário (com ou sem e-mail próprio): volta pro login provisório
      // e liga must_reset de novo — a RLS (owned_restaurant_ids) lê a flag no
      // banco, então o bloqueio vale imediatamente, inclusive pra sessões abertas.
      const { error } = await supabase.auth.admin.updateUserById(restaurant.auth_user_id, {
        email,
        password,
        email_confirm: true,
        app_metadata,
      })
      if (error) throw error
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata,
      })
      if (error) throw error
      const { error: linkError } = await supabase
        .from('restaurants')
        .update({ auth_user_id: data.user.id })
        .eq('id', restaurant.id)
      if (linkError) {
        await supabase.auth.admin.deleteUser(data.user.id)
        throw linkError
      }
    }

    return json({ ok: true, login, password })
  } catch (err) {
    console.error('admin-generate-access error:', err)
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
