// admin-login/index.ts
//
// Verifica a senha do super admin (admin/index.html) contra o secret
// SENHA_ADMIN, configurado nos secrets da Edge Function — nunca no
// frontend. Antes, a senha ficava em texto puro em config.js, visível a
// qualquer pessoa que abrisse "ver código-fonte" da página; agora o
// navegador manda só o que a pessoa digitou e recebe { ok: true/false } de
// volta, sem nunca ver (nem baixar) a senha real.
//
// Isso continua sendo só um gate de MVP, não autenticação de verdade: não há
// token de sessão assinado (o admin.js guarda só um "true" no sessionStorage
// depois do ok), e as policies de RLS de `restaurants` continuam permissivas
// pra anon key mesmo depois de logado (ver aviso na migration 0001 e no
// README) — quem passa por aqui não ganha mais nem menos acesso ao banco do
// que já tinha antes, só deixa de conseguir ler a senha certa direto do
// código do site.
//
// Request body: { senha: string }
// Response body: { ok: boolean }
//
// Arquivo autocontido (sem imports de ../_shared/), mesmo padrão do
// ai-waiter — pra poder ser colado direto no editor de Edge Functions do
// Supabase Dashboard.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { senha } = await req.json()
    const expected = Deno.env.get('SENHA_ADMIN')

    // Secret não configurado no Supabase: nunca libera, mesmo por acidente
    // (ex: alguém mandar senha vazia e o secret também estar vazio/ausente).
    if (!expected) {
      throw new Error('SENHA_ADMIN não configurada nos secrets do Supabase')
    }

    const ok = typeof senha === 'string' && senha.length > 0 && timingSafeEqual(senha, expected)

    return new Response(JSON.stringify({ ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('admin-login error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
