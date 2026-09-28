// api/cardapio-preview.js — Vercel Serverless Function.
//
// Zero-config: qualquer .js dentro de api/ vira um endpoint automaticamente
// no deploy da Vercel, sem precisar de package.json nem passo de build —
// mesmo espírito "sem build" do resto do projeto.
//
// Por que isso existe: cliente/index.html é uma SPA estática — o HTML é
// sempre o mesmo arquivo pra qualquer restaurante, os dados de verdade (nome,
// foto) só chegam depois, via JavaScript, buscando no Supabase. Isso é ótimo
// pra pessoas de verdade, mas ruim pra pré-visualização de link (WhatsApp,
// Facebook, Telegram, etc.): esses robôs de prévia só leem o HTML bruto da
// URL, nunca executam JavaScript, então sempre mostravam o ícone genérico do
// PapeiAI (favicon) em vez da foto de cada restaurante.
//
// Fica atrás da rota /cardapio/:slug (ver vercel.json) — um link "bonito",
// no domínio do próprio site (papeiai.com.br), pensado pra ser colado numa
// conversa. Dependendo de quem pede:
// - Pessoa de verdade (qualquer User-Agent que não bata com o padrão de bot
//   abaixo): redireciona na hora pro cardápio de verdade
//   (cliente/index.html?slug=...), sem passar por aqui de novo.
// - Robô de prévia de link: busca o restaurante direto na tabela
//   `restaurants` via API REST do Supabase (mesma anon key pública usada
//   pelo app inteiro, protegida por RLS de leitura pública — migration 0001)
//   e devolve um HTML só com as tags Open Graph certas — imagem = logo do
//   restaurante quando tiver; sem logo cadastrada, cai na imagem genérica do
//   PapeiAI (FALLBACK_IMAGE) em vez de deixar sem imagem nenhuma.
//
// O QR Code impresso/gerado no admin continua apontando direto pra
// menuUrl() (js/qrcode-helper.js) — sem esse salto extra, já que ninguém
// "pré-visualiza" um QR Code escaneado; esta rota é só para os links
// copiados/colados como texto.

const SUPABASE_URL = 'https://thwnhgpjysykkoblbtrd.supabase.co'
// anon key: pública por natureza (é a mesma exposta em config.js, protegida
// só pelas policies de RLS) — não é segredo, não precisa virar env var aqui.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRod25oZ3BqeXN5a2tvYmxidHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjU3NzksImV4cCI6MjEwNDY0MTc3OX0.sngg8z_ZUgpw3YixJ6y74qMaNLVGPeJ0e3Tlh7EY_TI'
const APP_BASE_URL = 'https://www.papeiai.com.br/'
// Prévia genérica do PapeiAI — usada quando o restaurante não tem logo
// cadastrada (restaurants.logo_url), pra prévia nunca sair sem imagem
// nenhuma.
const FALLBACK_IMAGE_URL = `${APP_BASE_URL}images/og-preview.png`

// Lista dos crawlers de pré-visualização mais comuns — não precisa ser
// exaustiva: se algum passar batido, o pior caso é essa pessoa (ou robô) só
// ver o redirecionamento normal, sem prévia bonita. Nunca quebra nada.
const BOT_UA_PATTERN =
  /facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|redditbot|pinterest|embedly|quora link preview|outbrain|vkshare|skypeuripreview|line\/|viber|w3c_validator/i

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildRealCardapioUrl(slug) {
  return `${APP_BASE_URL}cliente/index.html?slug=${encodeURIComponent(slug)}`
}

module.exports = async (req, res) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''

  if (!slug) {
    res.redirect(302, APP_BASE_URL)
    return
  }

  const realUrl = buildRealCardapioUrl(slug)
  const userAgent = req.headers['user-agent'] || ''
  const isBot = BOT_UA_PATTERN.test(userAgent)

  if (!isBot) {
    res.redirect(302, realUrl)
    return
  }

  let restaurant = null
  try {
    const query = new URLSearchParams({
      slug: `eq.${slug}`,
      is_active: 'eq.true',
      select: 'name,logo_url',
    })
    const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?${query.toString()}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    const rows = await supaRes.json()
    restaurant = Array.isArray(rows) && rows[0] ? rows[0] : null
  } catch {
    // Supabase fora do ar ou request falhou: cai pro título genérico abaixo
    // — a prévia fica menos rica, mas a página nunca quebra.
  }

  const title = restaurant ? `${restaurant.name} — Cardápio Digital` : 'PapeiAI — Cardápio Digital'
  const description = restaurant
    ? `Peça no ${restaurant.name} direto pelo cardápio digital, com o Ari, garçom IA.`
    : 'Cardápio digital com garçom IA — peça sem esperar o garçom.'
  const imageUrl = (restaurant && restaurant.logo_url) || FALLBACK_IMAGE_URL
  const imageTags = `<meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />`

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(realUrl)}" />
    ${imageTags}
    <meta http-equiv="refresh" content="0; url=${escapeHtml(realUrl)}" />
  </head>
  <body>
    <p>Redirecionando para o cardápio... <a href="${escapeHtml(realUrl)}">clique aqui</a> se não for automático.</p>
  </body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(html)
}
