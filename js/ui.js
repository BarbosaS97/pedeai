// ui.js — feedback de interface compartilhado pelas três áreas (admin, restaurante,
// cliente): toasts, modal de confirmação (substitui alert()/confirm() nativos,
// que travam a UI e não combinam com o resto do design), skeleton de
// carregamento e cópia para a área de transferência.
//
// Requer util.js (escapeHtml) carregado antes.

// ---- Toasts ----

const TOAST_STYLES = {
  success: 'bg-neutral-900 text-white',
  error: 'bg-brand-red text-white',
  info: 'bg-brand-purple text-white',
}

const TOAST_ICON = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

function ensureToastContainer() {
  let el = document.getElementById('toast-container')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast-container'
    el.className = 'fixed top-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 items-end'
    document.body.appendChild(el)
  }
  return el
}

function showToast(message, type = 'info', duration = 3200) {
  const container = ensureToastContainer()
  const el = document.createElement('div')
  el.className = `toast-item pointer-events-auto w-full sm:w-auto sm:max-w-xs shadow-lg rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
    TOAST_STYLES[type] || TOAST_STYLES.info
  }`
  el.innerHTML = `<span class="opacity-80">${TOAST_ICON[type] || TOAST_ICON.info}</span><span>${escapeHtml(message)}</span>`
  container.appendChild(el)

  requestAnimationFrame(() => el.classList.add('toast-in'))

  const remove = () => {
    el.classList.remove('toast-in')
    el.classList.add('toast-out')
    setTimeout(() => el.remove(), 200)
  }
  const timer = setTimeout(remove, duration)
  el.addEventListener('click', () => {
    clearTimeout(timer)
    remove()
  })
}

// ---- Modal de confirmação (substitui confirm()) ----
// Retorna uma Promise<boolean> — true se o usuário confirmou.
function showConfirm(options) {
  const { title = 'Confirmar ação', message = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } =
    options || {}

  return new Promise((resolve) => {
    const existing = document.getElementById('confirm-overlay')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.id = 'confirm-overlay'
    overlay.className = 'modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[90]'
    overlay.innerHTML = `
      <div class="modal-box bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
        <h3 class="font-semibold text-lg">${escapeHtml(title)}</h3>
        <p class="text-sm text-neutral-600">${escapeHtml(message)}</p>
        <div class="flex gap-2 pt-2">
          <button id="confirm-cancel-btn" type="button" class="flex-1 bg-neutral-100 text-neutral-700 font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">${escapeHtml(cancelLabel)}</button>
          <button id="confirm-ok-btn" type="button" class="flex-1 ${danger ? 'bg-brand-red' : 'bg-brand-purple'} text-white font-semibold rounded-lg py-2 hover:opacity-90 transition">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    function finish(result) {
      document.removeEventListener('keydown', onKeydown)
      overlay.remove()
      resolve(result)
    }
    function onKeydown(e) {
      if (e.key === 'Escape') finish(false)
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false)
    })
    overlay.querySelector('#confirm-cancel-btn').addEventListener('click', () => finish(false))
    overlay.querySelector('#confirm-ok-btn').addEventListener('click', () => finish(true))
    document.addEventListener('keydown', onKeydown)
    overlay.querySelector('#confirm-ok-btn').focus()
  })
}

// ---- Clipboard ----
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ---- Skeletons de carregamento (evita telas em branco/"Carregando...") ----
function skeletonCardsHtml(count = 3) {
  return Array.from({ length: count })
    .map(
      () => `
        <div class="bg-white border border-neutral-200 rounded-xl p-4 flex gap-4 animate-pulse">
          <div class="w-16 h-16 rounded-lg bg-neutral-200 shrink-0"></div>
          <div class="flex-1 space-y-2 py-1">
            <div class="h-3 bg-neutral-200 rounded w-1/3"></div>
            <div class="h-3 bg-neutral-200 rounded w-2/3"></div>
            <div class="h-3 bg-neutral-200 rounded w-1/5"></div>
          </div>
        </div>
      `
    )
    .join('')
}

// ---- Estado vazio padronizado ----
function emptyStateHtml(icon, message) {
  return `
    <div class="flex flex-col items-center justify-center text-center py-12 px-4 text-neutral-400">
      <span class="text-4xl mb-3">${icon}</span>
      <p class="text-sm">${escapeHtml(message)}</p>
    </div>
  `
}
