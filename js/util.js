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
