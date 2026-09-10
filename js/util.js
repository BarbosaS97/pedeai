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
