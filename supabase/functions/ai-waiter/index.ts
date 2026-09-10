// ai-waiter/index.ts
//
// O "garçom IA" do PedeAí. Recebe a mensagem do cliente e pede ao DeepSeek uma
// resposta contextualizada, usando o cardápio completo (todos os produtos
// disponíveis) do restaurante como contexto.
//
// Sem busca vetorial/embeddings: a API pública da DeepSeek não tem endpoint de
// embeddings (só chat), então em vez de buscar os produtos mais "parecidos"
// com a mensagem do cliente, mandamos o cardápio inteiro do restaurante no
// prompt e deixamos o próprio modelo escolher o que recomendar.
//
// Request body: { restaurante_slug: string, mensagem: string, historico?: {role, content}[] }
// Response body: { resposta: string }
//
// Arquivo autocontido (sem imports de ../_shared/) para poder ser colado
// direto no editor de Edge Functions do Supabase Dashboard, que não resolve
// imports relativos fora da pasta da própria função.

import { createClient } from 'npm:@supabase/supabase-js@2'

interface RequestBody {
  restaurante_slug: string
  mensagem: string
  historico?: { role: 'user' | 'assistant'; content: string }[]
}

// Headers CORS: as Edge Functions são chamadas diretamente do navegador
// (cardápio público e painel do restaurante), então precisam liberar
// preflight/OPTIONS e o header custom x-restaurant-token.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-restaurant-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// A chave DEEPSEEK_API_KEY é lida de Deno.env: só existe no ambiente da Edge
// Function (configurada via secret `DEEPSEEK_API_KEY`), NUNCA no frontend.
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

function deepseekApiKey(): string {
  const key = Deno.env.get('DEEPSEEK_API_KEY')
  if (!key) throw new Error('DEEPSEEK_API_KEY não configurada nos secrets do Supabase')
  return key
}

async function deepseekChat(messages: { role: string; content: string }[]) {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekApiKey()}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.6,
      max_tokens: 500,
    }),
  })
  if (!res.ok) {
    throw new Error(`DeepSeek chat error ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// service_role: só existe dentro da Edge Function, nunca chega ao navegador.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function buildSystemPrompt(restaurantName: string, produtos: { name: string; description: string | null; price: number }[]) {
  const cardapio = produtos
    .map((p) => `- ${p.name} (R$ ${p.price.toFixed(2)})${p.description ? `: ${p.description}` : ''}`)
    .join('\n')

  return `Você é o garçom virtual do restaurante "${restaurantName}", parte da plataforma PedeAí.
Seja simpático, breve e use um tom brasileiro informal ("Pede aí!").
Recomende pratos com base no pedido do cliente, usando APENAS os itens abaixo do
cardápio (não invente pratos que não estão na lista). Se nada combinar bem, diga
isso e sugira o item mais próximo.

Cardápio disponível:
${cardapio || '(cardápio ainda sem itens disponíveis — avise o cliente)'}

Responda em português, de forma curta (2-4 frases). Escreva em texto simples,
sem markdown — nunca use asteriscos, hashtags, sublinhado ou qualquer símbolo
de formatação para destacar palavras ou nomes de pratos.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { restaurante_slug, mensagem, historico = [] }: RequestBody = await req.json()

    if (!restaurante_slug || !mensagem) {
      return new Response(JSON.stringify({ error: 'restaurante_slug e mensagem são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('slug', restaurante_slug)
      .eq('is_active', true)
      .single()

    if (restaurantError || !restaurant) {
      return new Response(JSON.stringify({ error: 'Restaurante não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cardápio completo do restaurante (produtos disponíveis), usado como
    // contexto no prompt — sem busca vetorial.
    const { data: produtos, error: produtosError } = await supabase
      .from('products')
      .select('name, description, price')
      .eq('restaurant_id', restaurant.id)
      .eq('is_available', true)
      .order('name')
      .limit(60)

    if (produtosError) throw produtosError

    const systemPrompt = buildSystemPrompt(restaurant.name, produtos ?? [])
    const messages = [
      { role: 'system', content: systemPrompt },
      ...historico.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: mensagem },
    ]

    const resposta = await deepseekChat(messages)

    return new Response(JSON.stringify({ resposta }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('ai-waiter error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
