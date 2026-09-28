// util.js — helpers pequenos usados em todas as páginas.

function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatBRL(value) {
  return Number(value ?? 0).toFixed(2)
}

// Extrai uma mensagem legível de um erro capturado em catch(err). Erros do
// supabase-js (PostgrestError etc.) são objetos simples { message, code,
// details, hint }, NÃO instâncias de Error — "err instanceof Error" dá falso
// pra eles, e String(err) vira o inútil "[object Object]".
function errorMessage(err) {
  if (!err) return 'Erro desconhecido'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err.message === 'string' && err.message) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

// Aplica a cor de destaque do restaurante (restaurants.theme_color, migration
// 0012) como CSS var — cliente/cardapio.js e restaurante/painel.js chamam
// isso assim que os dados do restaurante carregam, antes do primeiro render.
// tailwind.config (cliente/index.html e restaurante/index.html) define
// `brand.orange` como `rgb(var(--brand-orange-rgb) / <alpha-value>)`, então
// toda classe existente (bg-brand-orange, text-brand-orange/40 etc.) já pega
// a cor certa sozinha — sem precisar trocar nenhuma className. Hex inválido
// (ou ausente) não faz nada: o :root em css/style.css já tem o laranja padrão
// como fallback.
function applyThemeColor(hex) {
  const match = typeof hex === 'string' ? /^#?([0-9a-f]{6})$/i.exec(hex.trim()) : null
  if (!match) return
  const int = parseInt(match[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  document.documentElement.style.setProperty('--brand-orange-rgb', `${r} ${g} ${b}`)
}

function loadingHtml(text) {
  return `<div class="min-h-screen flex items-center justify-center text-neutral-400">${escapeHtml(
    text || 'Carregando...'
  )}</div>`
}

function notFoundHtml(message) {
  return `
    <div class="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        ${renderLogo({ size: 'md' })}
        <p class="text-neutral-500 mt-4">${escapeHtml(message)}</p>
      </div>
    </div>
  `
}
