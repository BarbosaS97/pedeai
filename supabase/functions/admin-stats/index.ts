// admin-stats/index.ts
//
// Relatório por restaurante da aba "Análise" do portal mestre
// (admin/analytics.js): tokens da IA, aberturas do cardápio, produtos,
// categorias, mesas, pedidos e faturamento num período.
//
// Só responde a quem tem um token de sessão de admin válido — o mesmo que a
// Edge Function admin-login devolve quando a senha está certa (HMAC assinado
// com o secret SENHA_ADMIN, validade de 8 h). Os dados vêm de
// public.admin_analytics(from, to) (migration 0017), executável só pela
// service_role, então nem a anon key consegue ler as métricas direto.
//
// Request body: { token: string, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
// Response body: { ok: true, from, to, restaurants: [...], daily: {...} }
//              | { ok: false, error: 'unauthorized' | 'bad_range' | string }
//
// Arquivo autocontido (sem imports de ../_shared/), mesmo padrão das outras
// funções.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_RANGE_DAYS = 366

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const encoder = new TextEncoder()

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return atob(padded)
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Formato do token: <payload base64url({exp})>.<hmac base64url>
async function verifyAdminToken(token: unknown, secret: string): Promise<boolean> {
  if (typeof token !== 'string') return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = await hmacSha256(`${secret}|admin-session`, payload)
  if (!timingSafeEqual(sig, expected)) return false
  try {
    const { exp } = JSON.parse(b64urlDecode(payload))
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = Deno.env.get('SENHA_ADMIN')
    if (!secret) throw new Error('SENHA_ADMIN não configurada nos secrets do Supabase')

    const { token, from, to } = await req.json()

    if (!(await verifyAdminToken(token, secret))) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const dFrom = parseDate(from)
    const dTo = parseDate(to)
    if (!dFrom || !dTo || dTo < dFrom || (dTo.getTime() - dFrom.getTime()) / 86400000 > MAX_RANGE_DAYS) {
      return json({ ok: false, error: 'bad_range' }, 400)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.rpc('admin_analytics', { p_from: from, p_to: to })
    if (error) throw error

    return json({ ok: true, from, to, ...data })
  } catch (err) {
    console.error('admin-stats error:', err)
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
