// restaurant-finish-setup/index.ts
//
// Último passo do primeiro acesso do restaurante (restaurante/auth.js): depois
// que o dono já trocou o e-mail (confirmado pelo link enviado via Resend) e
// definiu a nova senha, o painel chama esta função pra desligar a flag
// app_metadata.must_reset — o que libera o acesso aos dados (ver
// owned_restaurant_ids(), migration 0015).
//
// A flag mora em app_metadata justamente porque só a service_role consegue
// escrever ali: o dono não consegue se "auto-liberar" pelo client. Esta função
// só desliga a flag se, do lado do servidor, o usuário do token:
//   - ainda estiver com must_reset ligado,
//   - tiver e-mail confirmado,
//   - e esse e-mail NÃO for mais o sintético do acesso provisório.
//
// Request: header Authorization: Bearer <access_token do usuário logado>
// Response body: { ok: true } | { ok: false, error }

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ ok: false, error: 'Não autenticado.' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase.auth.getUser(jwt)
    if (error || !data.user) return json({ ok: false, error: 'Sessão inválida.' }, 401)
    const user = data.user

    if (user.app_metadata?.must_reset !== true) return json({ ok: true }) // nada a fazer

    const email = user.email ?? ''
    if (!user.email_confirmed_at || !email || email.endsWith(`@${SYNTHETIC_DOMAIN}`)) {
      return json({ ok: false, error: 'Confirme seu e-mail antes de concluir o primeiro acesso.' }, 400)
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { must_reset: false },
    })
    if (updateError) throw updateError

    return json({ ok: true })
  } catch (err) {
    console.error('restaurant-finish-setup error:', err)
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
