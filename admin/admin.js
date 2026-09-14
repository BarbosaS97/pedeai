// admin.js — página admin/index.html (equivalente ao antigo /admin)

const ADMIN_SESSION_KEY = 'pedeai_admin_authenticated'
const root = document.getElementById('root')

const state = {
  authenticated: sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true',
  loginError: '',
  restaurants: [],
  loading: true,
  leads: [],
  leadsLoading: true,
  creating: false,
  formError: '',
  nameDraft: '',
  searchQuery: '',
  qrRestaurant: null,
  qrDataUrl: null,
  mesasRestaurant: null,
  mesasList: [],
  mesasLoading: false,
  mesasError: '',
  newMesaCount: '',
  renamingMesaId: null,
  renamingMesaDraft: '',
}

function render() {
  root.innerHTML = state.authenticated ? dashboardHtml() : loginHtml()
  bindEvents()
}

function loginHtml() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-purple/10 via-neutral-50 to-brand-orange/10 px-4">
      <form id="login-form" class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-5 fade-slide-in">
        <div class="flex justify-center mb-1">${renderLogo({ size: 'lg', showSlogan: true })}</div>
        <div class="flex items-center justify-center gap-1.5 text-neutral-500 text-sm">
          <span>🔒</span>
          <h1>Área do super admin</h1>
        </div>
        <input
          type="password"
          id="password-input"
          autofocus
          placeholder="Senha de admin"
          class="w-full border border-neutral-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition"
        />
        ${state.loginError ? `<p class="text-brand-red text-sm flex items-center gap-1.5">⚠️ ${escapeHtml(state.loginError)}</p>` : ''}
        <button
          type="submit"
          class="w-full bg-brand-purple text-white font-semibold rounded-lg py-2.5 hover:opacity-90 active:scale-[0.99] transition"
        >
          Entrar
        </button>
      </form>
    </div>
  `
}

function dashboardHtml() {
  const total = state.restaurants.length
  const active = state.restaurants.filter((r) => r.is_active).length

  return `
    <div class="min-h-screen bg-neutral-50">
      <header class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <div>
          ${renderLogo({ size: 'sm' })}
          <p class="text-xs text-neutral-400 mt-0.5">Painel do administrador</p>
        </div>
        <button id="logout-btn" class="text-sm text-neutral-500 hover:text-brand-red transition">Sair</button>
      </header>

      <main class="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <section class="grid grid-cols-2 gap-4">
          <div class="bg-white rounded-xl border border-neutral-200 p-4">
            <p class="text-xs text-neutral-400 font-medium">Restaurantes</p>
            <p class="text-2xl font-bold text-neutral-900 mt-1">${total}</p>
          </div>
          <div class="bg-white rounded-xl border border-neutral-200 p-4">
            <p class="text-xs text-neutral-400 font-medium">Ativos agora</p>
            <p class="text-2xl font-bold text-emerald-600 mt-1">${active}</p>
          </div>
        </section>

        <section class="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div class="flex items-center justify-between gap-3 mb-4">
            <h2 class="font-semibold text-lg">Leads da landing page (${state.leads.length})</h2>
            <button id="leads-refresh-btn" title="Atualizar" class="text-xs text-brand-purple hover:opacity-80 transition shrink-0">🔄 Atualizar</button>
          </div>
          <div id="leads-list">${state.leadsLoading ? skeletonCardsHtml(2) : leadsListHtml()}</div>
        </section>

        <section class="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 class="font-semibold text-lg mb-4">Cadastrar restaurante</h2>
          <form id="create-form" class="flex flex-col sm:flex-row gap-3">
            <input
              id="name-input"
              value="${escapeHtml(state.nameDraft)}"
              placeholder="Nome do restaurante"
              class="flex-1 border border-neutral-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition"
            />
            <button
              type="submit"
              ${state.creating ? 'disabled' : ''}
              class="bg-brand-orange text-white font-semibold rounded-lg px-5 py-2.5 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50 whitespace-nowrap"
            >
              ${state.creating ? 'Criando...' : '+ Cadastrar'}
            </button>
          </form>
          ${state.formError ? `<p class="text-brand-red text-sm mt-2 flex items-center gap-1.5">⚠️ ${escapeHtml(state.formError)}</p>` : ''}
        </section>

        <section class="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h2 class="font-semibold text-lg">Restaurantes (${total})</h2>
            ${
              total > 0
                ? `<input id="search-input" value="${escapeHtml(state.searchQuery)}" placeholder="Buscar por nome..." class="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-brand-purple transition" />`
                : ''
            }
          </div>
          <div id="restaurant-list">${state.loading ? skeletonCardsHtml(3) : restaurantListHtml()}</div>
        </section>
      </main>

      ${state.qrRestaurant ? qrModalHtml() : ''}
      ${state.mesasRestaurant ? mesasModalHtml() : ''}
    </div>
  `
}

function filteredRestaurants() {
  const q = state.searchQuery.trim().toLowerCase()
  if (!q) return state.restaurants
  return state.restaurants.filter((r) => r.name.toLowerCase().includes(q))
}

function restaurantStatusPill(isActive) {
  return isActive
    ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>Ativo</span>'
    : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-500"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>Inativo</span>'
}

function restaurantListHtml() {
  if (state.restaurants.length === 0) {
    return emptyStateHtml('🍽️', 'Nenhum restaurante cadastrado ainda. Cadastre o primeiro acima.')
  }
  const list = filteredRestaurants()
  if (list.length === 0) {
    return emptyStateHtml('🔍', `Nenhum restaurante encontrado para "${state.searchQuery}".`)
  }
  return `
    <div class="space-y-3">
      ${list
        .map(
          (r) => `
        <div class="card-hover fade-slide-in flex flex-col sm:flex-row sm:items-center gap-4 border border-neutral-200 rounded-xl px-4 py-4">
          <div class="w-11 h-11 rounded-full bg-brand-purple/10 text-brand-purple font-bold flex items-center justify-center text-lg shrink-0">
            ${escapeHtml(r.name.trim().charAt(0).toUpperCase() || '?')}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-semibold text-neutral-900 truncate">${escapeHtml(r.name)}</p>
              ${restaurantStatusPill(r.is_active)}
            </div>
            <div class="mt-1.5 space-y-1 text-xs">
              <div class="flex items-center gap-1.5 text-neutral-500">
                <span>🔗</span>
                <a href="${escapeHtml(menuUrl(r.slug))}" target="_blank" rel="noreferrer" class="underline truncate hover:text-brand-purple transition">Ver cardápio público</a>
                <button data-copy-id="${r.id}" data-copy-kind="menu" title="Copiar link do cardápio" class="text-neutral-400 hover:text-brand-purple transition shrink-0">⧉</button>
              </div>
              <div class="flex items-center gap-1.5 text-neutral-500">
                <span>🧑‍🍳</span>
                <a href="${escapeHtml(panelUrl(r.access_token))}" target="_blank" rel="noreferrer" class="underline truncate text-brand-purple hover:opacity-80 transition">Abrir painel do restaurante</a>
                <button data-copy-id="${r.id}" data-copy-kind="panel" title="Copiar link do painel" class="text-neutral-400 hover:text-brand-purple transition shrink-0">⧉</button>
              </div>
            </div>
          </div>
          <div class="flex sm:flex-col gap-2 shrink-0">
            <button data-action="qr" data-id="${r.id}" class="flex-1 sm:flex-none text-xs bg-brand-purple/10 text-brand-purple font-medium rounded-lg px-3 py-1.5 hover:bg-brand-purple/20 transition">QR Code</button>
            <button data-action="mesas" data-id="${r.id}" class="flex-1 sm:flex-none text-xs bg-brand-orange/10 text-brand-orange font-medium rounded-lg px-3 py-1.5 hover:bg-brand-orange/20 transition">Mesas</button>
            <button data-action="toggle" data-id="${r.id}" class="flex-1 sm:flex-none text-xs bg-neutral-100 text-neutral-600 font-medium rounded-lg px-3 py-1.5 hover:bg-neutral-200 transition">${r.is_active ? 'Desativar' : 'Ativar'}</button>
            <button data-action="regen" data-id="${r.id}" class="flex-1 sm:flex-none text-xs bg-brand-red/10 text-brand-red font-medium rounded-lg px-3 py-1.5 hover:bg-brand-red/20 transition">Regenerar link</button>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `
}

// ---- Leads da landing page (migration 0010_leads.sql) ----

function leadsListHtml() {
  if (state.leads.length === 0) {
    return emptyStateHtml('📭', 'Nenhum lead ainda. Assim que alguém preencher o formulário da landing page, aparece aqui.')
  }
  return `
    <div class="space-y-2">
      ${state.leads
        .map(
          (l) => `
        <div class="fade-slide-in flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border border-neutral-200 rounded-lg px-4 py-3">
          <div class="flex-1 min-w-0">
            <p class="font-medium text-neutral-900 truncate">${escapeHtml(l.name)}</p>
            <p class="text-xs text-neutral-400">${new Date(l.created_at).toLocaleString('pt-BR')}</p>
          </div>
          <div class="flex items-center gap-3 text-sm shrink-0">
            <a href="tel:${escapeHtml(l.phone.replace(/\D/g, ''))}" class="text-brand-purple hover:underline">${escapeHtml(l.phone)}</a>
            <a href="mailto:${escapeHtml(l.email)}" class="text-brand-purple hover:underline truncate max-w-[10rem]">${escapeHtml(l.email)}</a>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `
}

async function loadLeads() {
  state.leadsLoading = true
  const { data, error } = await supabaseClient
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) showToast('Erro ao carregar leads.', 'error')
  state.leads = data || []
  state.leadsLoading = false
  const list = document.getElementById('leads-list')
  if (list) list.innerHTML = leadsListHtml()
  const refreshBtn = document.getElementById('leads-refresh-btn')
  const header = refreshBtn ? refreshBtn.previousElementSibling : null
  if (header) header.textContent = `Leads da landing page (${state.leads.length})`
}

function qrModalHtml() {
  const r = state.qrRestaurant
  return `
    <div id="qr-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div id="qr-box" class="modal-box bg-white rounded-2xl p-6 max-w-xs w-full text-center space-y-4">
        <h3 class="font-semibold">${escapeHtml(r.name)}</h3>
        ${
          state.qrDataUrl
            ? `<img src="${state.qrDataUrl}" alt="QR Code de ${escapeHtml(r.name)}" class="mx-auto rounded-lg border border-neutral-100" />`
            : `<div class="py-12 flex flex-col items-center gap-2 text-neutral-400">
                <div class="w-8 h-8 border-2 border-brand-purple/30 border-t-brand-purple rounded-full animate-spin"></div>
                <p class="text-sm">Gerando QR Code...</p>
              </div>`
        }
        <div class="flex items-center gap-1.5 justify-center text-xs text-neutral-500">
          <span class="truncate max-w-[200px]">${escapeHtml(menuUrl(r.slug))}</span>
          <button id="qr-copy-btn" title="Copiar link" class="text-neutral-400 hover:text-brand-purple transition shrink-0">⧉</button>
        </div>
        <div class="flex gap-2">
          ${
            state.qrDataUrl
              ? `<a href="${state.qrDataUrl}" download="qrcode-${escapeHtml(r.slug)}.png" class="flex-1 bg-brand-purple text-white text-sm font-semibold rounded-lg py-2 hover:opacity-90 transition">Baixar PNG</a>`
              : ''
          }
          <button id="qr-close-btn" class="flex-1 bg-neutral-100 text-neutral-600 text-sm font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">Fechar</button>
        </div>
      </div>
    </div>
  `
}

// ---- Mesas e QR Codes por mesa (migration 0008_mesas.sql) ----

function mesasModalHtml() {
  const r = state.mesasRestaurant
  return `
    <div id="mesas-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div id="mesas-box" class="modal-box bg-white rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-5">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-lg">QR Codes e mesas</h3>
            <p class="text-sm text-neutral-500">${escapeHtml(r.name)}</p>
          </div>
          <button id="mesas-close-btn" title="Fechar" class="text-neutral-400 hover:text-neutral-600 transition text-xl leading-none w-9 h-9 flex items-center justify-center -mr-2">✕</button>
        </div>

        <form id="mesas-generate-form" class="flex gap-2 items-end">
          <div class="flex-1">
            <label for="mesas-count-input" class="text-xs font-semibold text-neutral-500">Quantas mesas?</label>
            <input
              id="mesas-count-input"
              type="number"
              min="1"
              max="200"
              value="${escapeHtml(state.newMesaCount)}"
              placeholder="Ex: 8"
              class="w-full border border-neutral-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-brand-purple transition"
            />
          </div>
          <button type="submit" class="bg-brand-purple text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:opacity-90 transition shrink-0">Gerar</button>
        </form>
        <p class="text-xs text-neutral-400 -mt-3">Cria as mesas 1 a N. Mesas que já existem (inclusive renomeadas) não são duplicadas — dá pra gerar de novo com um número maior só pra adicionar mesas novas.</p>
        ${state.mesasError ? `<p class="text-brand-red text-sm flex items-center gap-1.5">⚠️ ${escapeHtml(state.mesasError)}</p>` : ''}

        <div id="mesas-list">${mesasListHtml()}</div>

        ${
          state.mesasList.length > 0
            ? `<a href="mesas-print.html?restaurant=${encodeURIComponent(r.id)}" target="_blank" rel="noreferrer" class="block text-center bg-brand-orange text-white text-sm font-semibold rounded-lg py-2.5 hover:opacity-90 transition">Baixar folha de impressão</a>`
            : ''
        }
      </div>
    </div>
  `
}

function mesasListHtml() {
  if (state.mesasLoading) return skeletonCardsHtml(2)
  if (state.mesasList.length === 0) {
    return emptyStateHtml('🪑', 'Nenhuma mesa cadastrada ainda. Gere acima pra começar.')
  }
  return `<div class="space-y-2">${state.mesasList.map(mesaRowHtml).join('')}</div>`
}

function mesaRowHtml(m) {
  if (state.renamingMesaId === m.id) {
    return `
      <form data-rename-mesa-form="${m.id}" class="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
        <input data-rename-mesa-input value="${escapeHtml(state.renamingMesaDraft)}" class="flex-1 bg-transparent text-sm focus:outline-none" />
        <button type="submit" title="Salvar" class="text-emerald-600 text-sm w-7 h-7 flex items-center justify-center hover:bg-emerald-50 rounded-full transition shrink-0">✓</button>
        <button type="button" data-cancel-rename-mesa="${m.id}" title="Cancelar" class="text-neutral-400 text-sm w-7 h-7 flex items-center justify-center hover:bg-neutral-200 rounded-full transition shrink-0">✕</button>
      </form>
    `
  }
  return `
    <div class="flex items-center gap-2 border border-neutral-200 rounded-lg px-3 py-2">
      <span class="flex-1 text-sm font-medium truncate">${escapeHtml(m.numero)}</span>
      <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${m.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-500'}">${m.ativo ? 'Ativa' : 'Inativa'}</span>
      <button data-mesa-action="rename" data-mesa-id="${m.id}" title="Renomear" class="text-neutral-400 hover:text-brand-purple w-7 h-7 flex items-center justify-center rounded-full transition shrink-0">✎</button>
      <button data-mesa-action="toggle" data-mesa-id="${m.id}" title="${m.ativo ? 'Desativar' : 'Ativar'}" class="text-xs bg-neutral-100 rounded-lg px-2 py-1 hover:bg-neutral-200 transition shrink-0">${m.ativo ? 'Desativar' : 'Ativar'}</button>
      <button data-mesa-action="delete" data-mesa-id="${m.id}" title="Excluir" class="text-neutral-400 hover:text-brand-red w-7 h-7 flex items-center justify-center rounded-full transition shrink-0">✕</button>
    </div>
  `
}

function openMesasModal(r) {
  state.mesasRestaurant = r
  state.mesasList = []
  state.mesasLoading = true
  state.mesasError = ''
  state.newMesaCount = ''
  state.renamingMesaId = null
  render()
  loadMesas()
}

function closeMesasModal() {
  state.mesasRestaurant = null
  render()
}

function mesaSortComparator(a, b) {
  const na = parseInt(a.numero, 10)
  const nb = parseInt(b.numero, 10)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true })
}

async function loadMesas() {
  const { data, error } = await supabaseClient
    .from('mesas')
    .select('*')
    .eq('restaurant_id', state.mesasRestaurant.id)
  if (error) showToast('Erro ao carregar mesas.', 'error')
  state.mesasList = (data || []).slice().sort(mesaSortComparator)
  state.mesasLoading = false
  refreshMesasModal()
}

// Re-renderiza só o miolo do modal (lista + botão de impressão), sem
// recriar o formulário de geração — assim o campo "Quantas mesas?" não
// perde o valor/foco enquanto o admin ainda está digitando.
function refreshMesasModal() {
  const box = document.getElementById('mesas-box')
  if (!box) return
  document.getElementById('mesas-list').innerHTML = mesasListHtml()
  const existingPrintBtn = box.querySelector('a[href^="mesas-print.html"]')
  if (state.mesasList.length > 0 && !existingPrintBtn) {
    box.insertAdjacentHTML(
      'beforeend',
      `<a href="mesas-print.html?restaurant=${encodeURIComponent(state.mesasRestaurant.id)}" target="_blank" rel="noreferrer" class="block text-center bg-brand-orange text-white text-sm font-semibold rounded-lg py-2.5 hover:opacity-90 transition">Baixar folha de impressão</a>`
    )
  } else if (state.mesasList.length === 0 && existingPrintBtn) {
    existingPrintBtn.remove()
  }
}

async function handleGenerateMesas(e) {
  e.preventDefault()
  const n = parseInt(state.newMesaCount, 10)
  if (!Number.isFinite(n) || n < 1 || n > 200) {
    state.mesasError = 'Digite um número de mesas válido (1 a 200).'
    render()
    return
  }
  state.mesasError = ''
  const rows = Array.from({ length: n }, (_, i) => ({
    restaurant_id: state.mesasRestaurant.id,
    numero: String(i + 1),
  }))
  // upsert + ignoreDuplicates: mesas que já existem (inclusive renomeadas —
  // essas têm outro "numero", então nem colidem) ficam como estão; só as que
  // faltam são criadas. Evita ter que buscar o estado atual antes de decidir
  // o que inserir.
  const { error } = await supabaseClient
    .from('mesas')
    .upsert(rows, { onConflict: 'restaurant_id,numero', ignoreDuplicates: true })
  if (error) showToast('Erro ao gerar mesas: ' + errorMessage(error), 'error')
  else showToast('Mesas geradas!', 'success')
  state.newMesaCount = ''
  const input = document.getElementById('mesas-count-input')
  if (input) input.value = ''
  await loadMesas()
}

async function toggleMesaActive(m) {
  const { error } = await supabaseClient.from('mesas').update({ ativo: !m.ativo }).eq('id', m.id)
  if (error) showToast('Erro ao atualizar mesa.', 'error')
  await loadMesas()
}

async function deleteMesa(m) {
  const confirmed = await showConfirm({
    title: 'Excluir mesa',
    message: `Remover a mesa "${m.numero}"? O QR Code já impresso para ela para de funcionar.`,
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!confirmed) return
  const { error } = await supabaseClient.from('mesas').delete().eq('id', m.id)
  if (error) showToast('Erro ao excluir mesa.', 'error')
  else showToast('Mesa excluída.', 'success')
  await loadMesas()
}

function startRenameMesa(m) {
  state.renamingMesaId = m.id
  state.renamingMesaDraft = m.numero
  refreshMesasModal()
}

async function submitRenameMesa(e) {
  e.preventDefault()
  const draft = state.renamingMesaDraft.trim()
  const id = state.renamingMesaId
  state.renamingMesaId = null
  if (!draft) {
    refreshMesasModal()
    return
  }
  const { error } = await supabaseClient.from('mesas').update({ numero: draft }).eq('id', id)
  if (error) showToast('Erro ao renomear mesa: ' + errorMessage(error), 'error')
  else showToast('Mesa renomeada!', 'success')
  await loadMesas()
}

// Delegado no container: chamado uma vez só, por bindEvents() (quando
// #mesas-list é criado do zero por um render() completo). refreshMesasModal()
// só troca o innerHTML de dentro — os listeners daqui continuam valendo pros
// novos filhos, sem precisar (e sem risco de duplicar) religar de novo.
function bindMesasListEvents() {
  const list = document.getElementById('mesas-list')
  if (!list) return
  list.addEventListener('click', (e) => {
    const cancelBtn = e.target.closest('[data-cancel-rename-mesa]')
    if (cancelBtn) {
      state.renamingMesaId = null
      refreshMesasModal()
      return
    }
    const btn = e.target.closest('[data-mesa-action]')
    if (!btn) return
    const mesa = state.mesasList.find((m) => m.id === btn.getAttribute('data-mesa-id'))
    if (!mesa) return
    const action = btn.getAttribute('data-mesa-action')
    if (action === 'rename') startRenameMesa(mesa)
    if (action === 'toggle') toggleMesaActive(mesa)
    if (action === 'delete') deleteMesa(mesa)
  })
  list.addEventListener('submit', (e) => {
    if (e.target.hasAttribute('data-rename-mesa-form')) submitRenameMesa(e)
  })
  list.addEventListener('input', (e) => {
    if (e.target.hasAttribute('data-rename-mesa-input')) state.renamingMesaDraft = e.target.value
  })
}

function bindEvents() {
  if (!state.authenticated) {
    document.getElementById('login-form').addEventListener('submit', handleLogin)
    return
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    location.reload()
  })

  document.getElementById('name-input').addEventListener('input', (e) => {
    state.nameDraft = e.target.value
  })

  document.getElementById('create-form').addEventListener('submit', handleCreate)

  const leadsRefreshBtn = document.getElementById('leads-refresh-btn')
  if (leadsRefreshBtn) leadsRefreshBtn.addEventListener('click', loadLeads)

  const searchInput = document.getElementById('search-input')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value
      document.getElementById('restaurant-list').innerHTML = restaurantListHtml()
      bindRestaurantListEvents()
    })
  }

  bindRestaurantListEvents()

  const overlay = document.getElementById('qr-overlay')
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeQrModal()
    })
    document.getElementById('qr-close-btn').addEventListener('click', closeQrModal)
    const copyBtn = document.getElementById('qr-copy-btn')
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyLinkWithFeedback(menuUrl(state.qrRestaurant.slug)))
    }
  }

  const mesasOverlay = document.getElementById('mesas-overlay')
  if (mesasOverlay) {
    mesasOverlay.addEventListener('click', (e) => {
      if (e.target === mesasOverlay) closeMesasModal()
    })
    document.getElementById('mesas-close-btn').addEventListener('click', closeMesasModal)
    document.getElementById('mesas-generate-form').addEventListener('submit', handleGenerateMesas)
    document.getElementById('mesas-count-input').addEventListener('input', (e) => {
      state.newMesaCount = e.target.value
    })
    bindMesasListEvents()
  }
}

function bindRestaurantListEvents() {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id')
      const restaurant = state.restaurants.find((r) => r.id === id)
      const action = btn.getAttribute('data-action')
      if (action === 'qr') openQrModal(restaurant)
      if (action === 'mesas') openMesasModal(restaurant)
      if (action === 'toggle') toggleActive(restaurant)
      if (action === 'regen') regenerateToken(restaurant)
    })
  })

  document.querySelectorAll('[data-copy-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const restaurant = state.restaurants.find((r) => r.id === btn.getAttribute('data-copy-id'))
      if (!restaurant) return
      const kind = btn.getAttribute('data-copy-kind')
      const link = kind === 'panel' ? panelUrl(restaurant.access_token) : menuUrl(restaurant.slug)
      copyLinkWithFeedback(link)
    })
  })
}

async function copyLinkWithFeedback(link) {
  const ok = await copyToClipboard(link)
  showToast(ok ? 'Link copiado!' : 'Não deu para copiar — copie manualmente.', ok ? 'success' : 'error')
}

function handleLogin(e) {
  e.preventDefault()
  // Gate simples de MVP: senha comparada no cliente contra PEDEAI_CONFIG.ADMIN_PASSWORD.
  // Não é autenticação real — ver aviso de segurança no README/migrations.
  // Antes de produção, migrar para Supabase Auth.
  const password = document.getElementById('password-input').value
  const expected = window.PEDEAI_CONFIG.ADMIN_PASSWORD
  if (expected && password === expected) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
    state.authenticated = true
    state.loginError = ''
    render()
    loadRestaurants()
    loadLeads()
  } else {
    state.loginError = 'Senha incorreta.'
    render()
  }
}

async function loadRestaurants() {
  state.loading = true
  render()
  const { data, error } = await supabaseClient
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    state.formError = error.message
    showToast('Erro ao carregar restaurantes.', 'error')
  } else {
    state.restaurants = data
  }
  state.loading = false
  render()
}

async function handleCreate(e) {
  e.preventDefault()
  const name = state.nameDraft.trim()
  if (!name) return
  state.creating = true
  state.formError = ''
  render()

  const slug = slugify(name)
  const { error } = await supabaseClient.from('restaurants').insert({ name, slug })

  if (error) {
    state.formError = error.message
  } else {
    state.nameDraft = ''
    showToast(`"${name}" cadastrado!`, 'success')
  }
  state.creating = false
  await loadRestaurants()
}

async function toggleActive(r) {
  const { error } = await supabaseClient.from('restaurants').update({ is_active: !r.is_active }).eq('id', r.id)
  if (error) showToast('Erro ao atualizar restaurante.', 'error')
  else showToast(r.is_active ? `"${r.name}" desativado.` : `"${r.name}" ativado.`, 'success')
  loadRestaurants()
}

async function regenerateToken(r) {
  const confirmed = await showConfirm({
    title: 'Regenerar link do painel',
    message: `O link atual do painel de "${r.name}" deixará de funcionar e um novo será gerado. Continuar?`,
    confirmLabel: 'Regenerar',
    danger: true,
  })
  if (!confirmed) return
  const newToken = crypto.randomUUID().replace(/-/g, '')
  const { error } = await supabaseClient.from('restaurants').update({ access_token: newToken }).eq('id', r.id)
  if (error) showToast('Erro ao regenerar link.', 'error')
  else showToast('Novo link gerado.', 'success')
  loadRestaurants()
}

function openQrModal(r) {
  state.qrRestaurant = r
  state.qrDataUrl = null
  render()
  generateMenuQrCode(r.slug).then((dataUrl) => {
    if (state.qrRestaurant && state.qrRestaurant.id === r.id) {
      state.qrDataUrl = dataUrl
      render()
    }
  })
}

function closeQrModal() {
  state.qrRestaurant = null
  state.qrDataUrl = null
  render()
}

render()
if (state.authenticated) {
  loadRestaurants()
  loadLeads()
}
