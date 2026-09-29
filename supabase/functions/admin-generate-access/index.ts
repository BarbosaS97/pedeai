// admin-generate-access/index.ts
//
// "Gerar acesso provisório" do super admin (admin/index.html): cria — ou
// recria, se o restaurante já tem login — o usuário do Supabase Auth do
// restaurante com um login e uma senha provisórios, e devolve as
// credenciais UMA vez pro admin repassar ao dono.
//
// Exige a senha do super admin em CADA chamada (o admin digita de novo no
// modal), comparada com o secret SENHA_ADMIN — mesma verificação do
// admin-login. Usa a service_role key (só existe aqui, no servidor) pra
// mexer no Supabase Auth.
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
// Response body: { ok: true, login, password } | { ok: false, error }
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
    if (typeof senha !== 'string' || senha.length === 0 || !timingSafeEqual(senha, expected)) {
      return json({ ok: false, error: 'Senha de admin incorreta.' }, 401)
    }
    if (typeof restaurant_id !== 'string' || !restaurant_id) {
      return json({ ok: false, error: 'restaurant_id é obrigatório.' }, 400)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

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
