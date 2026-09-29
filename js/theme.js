// theme.js — tema claro/escuro do admin e do painel do restaurante.
//
// Carregado no <head> (síncrono) pra aplicar o tema ANTES da primeira pintura
// e não piscar branco. Sem escolha salva, segue a preferência do sistema
// (prefers-color-scheme); depois que a pessoa clica no botão, a escolha dela
// vale e fica salva no navegador. O cardápio público do cliente tem tema
// escuro próprio e não carrega este arquivo.

const THEME_STORAGE_KEY = 'papeiai-theme'

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function currentTheme() {
  return storedTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {}
  applyTheme(next)
}

// Botão pequeno pro topo. O ícone (lua/sol) troca só via CSS conforme
// html[data-theme], então o HTML é o mesmo nos dois temas e não precisa ser
// re-renderizado ao alternar.
function themeToggleHtml(extraClass = '') {
  return `
    <button type="button" data-theme-toggle title="Alternar tema claro/escuro" aria-label="Alternar tema claro/escuro"
      class="theme-toggle text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition w-9 h-9 flex items-center justify-center rounded-full shrink-0 ${extraClass}">
      <svg class="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <svg class="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    </button>
  `
}

applyTheme(currentTheme())

// Delegado no document: os headers são re-renderizados via innerHTML, então
// ligar o clique direto no botão se perderia a cada render.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-theme-toggle]')) toggleTheme()
})

// Sem escolha salva, acompanha o sistema em tempo real.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!storedTheme()) applyTheme(currentTheme())
})
