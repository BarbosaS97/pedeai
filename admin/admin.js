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
  whatsappDraft: '',
  searchQuery: '',
  statusFilter: 'all', // 'all' | 'active' | 'inactive' | 'noaccess' — ver RESTAURANT_FILTERS
  qrRestaurant: null,
  qrDataUrl: null,
  whatsappRestaurant: null,
  // Modal "Gerar acesso provisório": fase 'password' (pede a senha do admin de
  // novo) → 'result' (mostra login + senha provisória, uma única vez).
  accessRestaurant: null,
  accessPhase: 'password',
  accessLoading: false,
  accessError: '',
  accessResult: null,
  accessIsNew: false,
  whatsappEditDraft: '',
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
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-blue/10 via-neutral-50 to-brand-orange/10 px-4">
      ${themeToggleHtml('fixed top-4 right-4')}
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
          class="w-full border border-neutral-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
        />
        <div id="login-turnstile"></div>
        <div id="login-error">${state.loginError ? `<p class="text-brand-red text-sm flex items-start gap-1.5">⚠️ <span>${escapeHtml(state.loginError)}</span></p>` : ''}</div>
        <button
          type="submit"
          class="w-full bg-brand-blue text-white font-semibold rounded-lg py-2.5 shadow-brand-blue hover:opacity-90 active:scale-[0.99] transition"
        >
          Entrar
        </button>
      </form>
    </div>
  `
}

// ---- Ícones do dashboard (SVG de traço, herdam a cor do texto) ----
const A_ICON_PATHS = {
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  panel: '<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
  phone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
}

function aIcon(name, size = 16) {
  return `<svg class="shrink-0" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${A_ICON_PATHS[name]}</svg>`
}

const A_ICON_WHATSAPP = `<svg class="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.16 2 11.29c0 2.01.73 3.86 1.98 5.39L2.6 21.4a.5.5 0 0 0 .62.62l4.9-1.43a10.4 10.4 0 0 0 3.88.76c5.52 0 10-4.16 10-9.29S17.52 2 12 2Zm5.2 13.13c-.22.62-1.28 1.19-1.77 1.24-.45.05-.91.23-3.06-.64-2.59-1.05-4.25-3.7-4.38-3.87-.13-.17-1.05-1.4-1.05-2.66 0-1.27.67-1.89.9-2.15.22-.25.48-.31.64-.31.16 0 .32 0 .46.01.15.01.35-.06.55.42.22.53.73 1.83.79 1.96.06.13.1.29.02.46-.08.17-.13.28-.25.43-.13.15-.27.34-.38.46-.13.13-.26.27-.11.53.15.26.67 1.1 1.44 1.79.99.88 1.82 1.15 2.08 1.28.26.13.41.11.56-.07.15-.18.64-.75.81-1.01.17-.26.34-.21.56-.13.23.09 1.47.7 1.72.83.26.13.43.19.49.3.06.11.06.6-.16 1.22Z"/></svg>`

const RESTAURANT_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'inactive', label: 'Inativos' },
  { key: 'noaccess', label: 'Sem acesso' },
]

function restaurantMatchesFilter(r, key) {
  if (key === 'active') return r.is_active
  if (key === 'inactive') return !r.is_active
  if (key === 'noaccess') return !r.auth_user_id
  return true
}

function statCardHtml(label, value, { tone = 'text-neutral-900', hint = '', id = '' } = {}) {
  return `
    <div class="bg-white rounded-2xl border border-neutral-200 p-4">
      <p class="text-xs text-neutral-400 font-medium">${label}</p>
      <p ${id ? `id="${id}" ` : ''}class="text-2xl sm:text-3xl font-bold ${tone} mt-1">${value}</p>
      ${hint ? `<p class="text-[11px] text-neutral-400 mt-0.5">${hint}</p>` : ''}
    </div>
  `
}

function dashboardHtml() {
  const total = state.restaurants.length
  const active = state.restaurants.filter((r) => r.is_active).length
  const noAccess = state.restaurants.filter((r) => !r.auth_user_id).length

  return `
    <div class="min-h-screen bg-neutral-50">
      <header class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          ${renderLogo({ size: 'sm' })}
          <p class="text-xs text-neutral-400 mt-0.5 truncate">Painel do administrador</p>
        </div>
        <div class="flex items-center gap-1 sm:gap-2 shrink-0">
          ${themeToggleHtml()}
          <button id="logout-btn" title="Sair" class="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-red hover:bg-neutral-100 transition rounded-full h-9 px-3">
            ${aIcon('logout')}<span class="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-4 sm:space-y-6">
        <section class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          ${statCardHtml('Restaurantes', total)}
          ${statCardHtml('Ativos agora', active, { tone: 'text-emerald-600' })}
          ${statCardHtml('Sem acesso gerado', noAccess, { tone: noAccess > 0 ? 'text-amber-500' : 'text-neutral-900', hint: noAccess > 0 ? 'Gere o acesso provisório' : '' })}
          ${statCardHtml('Leads', state.leads.length, { tone: 'text-brand-blue', hint: 'da landing page', id: 'stat-leads' })}
        </section>

        <!-- Mobile: cadastrar → restaurantes → leads. lg+: lista à esquerda (as
             2 linhas), cadastrar e leads empilhados na coluna da direita. -->
        <div class="grid gap-4 sm:gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr] lg:items-start">
          <section class="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4 sm:p-6 lg:col-start-2 lg:row-start-1">
            <h2 class="font-semibold text-lg mb-3 sm:mb-4">Cadastrar restaurante</h2>
            <form id="create-form" class="space-y-3">
              <div class="flex flex-col sm:flex-row lg:flex-col gap-3">
                <input
                  id="name-input"
                  value="${escapeHtml(state.nameDraft)}"
                  placeholder="Nome do restaurante"
                  autocomplete="off"
                  class="flex-1 min-w-0 border border-neutral-300 rounded-lg px-4 py-3 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
                />
                <input
                  id="create-whatsapp-input"
                  value="${escapeHtml(state.whatsappDraft)}"
                  placeholder="WhatsApp (opcional)"
                  inputmode="numeric"
                  autocomplete="off"
                  class="sm:w-52 lg:w-full border border-neutral-300 rounded-lg px-4 py-3 sm:py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
                />
              </div>
              <p id="slug-preview" class="text-xs text-neutral-400 break-all min-h-[1rem]">${slugPreviewText(state.nameDraft)}</p>
              <button
                type="submit"
                ${state.creating ? 'disabled' : ''}
                class="w-full bg-brand-orange text-white font-semibold rounded-lg px-5 py-3 sm:py-2.5 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50 whitespace-nowrap"
              >
                ${state.creating ? 'Criando...' : '+ Cadastrar'}
              </button>
            </form>
            ${state.formError ? `<p class="text-brand-red text-sm mt-2 flex items-start gap-1.5">⚠️ <span>${escapeHtml(state.formError)}</span></p>` : ''}
          </section>

          <section class="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4 sm:p-6 lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 class="font-semibold text-lg">Restaurantes (${total})</h2>
              ${
                total > 0
                  ? `<input id="search-input" type="search" value="${escapeHtml(state.searchQuery)}" placeholder="Buscar por nome..." class="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-brand-blue transition" />`
                  : ''
              }
            </div>
            ${total > 0 ? `<div id="restaurant-filters" class="-mx-4 px-4 sm:mx-0 sm:px-0 mb-4 flex gap-2 overflow-x-auto scroll-contain pb-1">${restaurantFiltersHtml()}</div>` : ''}
            <div id="restaurant-list">${state.loading ? skeletonCardsHtml(3) : restaurantListHtml()}</div>
          </section>

          <section class="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4 sm:p-6 lg:col-start-2 lg:row-start-2">
            <div class="flex items-center justify-between gap-3 mb-3 sm:mb-4">
              <h2 class="font-semibold text-lg">Leads (${state.leads.length})</h2>
              <button id="leads-refresh-btn" title="Atualizar" class="flex items-center gap-1.5 text-xs text-brand-blue hover:bg-brand-blue/10 transition shrink-0 rounded-lg px-2.5 py-2">${aIcon('refresh', 14)}Atualizar</button>
            </div>
            <p class="text-xs text-neutral-400 -mt-2 mb-3">Contatos que preencheram o formulário da landing page.</p>
            <div id="leads-list" class="lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1">${state.leadsLoading ? skeletonCardsHtml(2) : leadsListHtml()}</div>
          </section>
        </div>
      </main>

      ${state.qrRestaurant ? qrModalHtml() : ''}
      ${state.mesasRestaurant ? mesasModalHtml() : ''}
      ${state.whatsappRestaurant ? whatsappModalHtml() : ''}
      ${state.accessRestaurant ? accessModalHtml() : ''}
    </div>
  `
}

// "cardapio/<slug>" que o nome digitado vai gerar — o dono do admin vê o
// endereço antes de cadastrar (e nota, por exemplo, nomes que colidem).
function slugPreviewText(name) {
  const slug = name.trim() ? slugify(name) : ''
  return slug ? `Endereço do cardápio: <span class="font-medium text-neutral-500">…/cardapio/${escapeHtml(slug)}</span>` : ''
}

function restaurantFiltersHtml() {
  return RESTAURANT_FILTERS.map((f) => {
    const count = state.restaurants.filter((r) => restaurantMatchesFilter(r, f.key)).length
    const on = state.statusFilter === f.key
    return `<button type="button" data-filter="${f.key}" class="shrink-0 text-sm font-medium rounded-full px-3.5 py-1.5 border transition ${
      on
        ? 'bg-brand-blue text-white border-brand-blue'
        : 'bg-white text-neutral-600 border-neutral-300 hover:border-brand-blue hover:text-brand-blue'
    }">${f.label} <span class="${on ? 'text-white/80' : 'text-neutral-400'}">${count}</span></button>`
  }).join('')
}

function filteredRestaurants() {
  const q = state.searchQuery.trim().toLowerCase()
  return state.restaurants.filter(
    (r) => restaurantMatchesFilter(r, state.statusFilter) && (!q || r.name.toLowerCase().includes(q))
  )
}

function restaurantStatusPill(isActive) {
  return isActive
    ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>Ativo</span>'
    : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-500"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>Inativo</span>'
}

function restaurantInfoRow(icon, content) {
  return `<div class="flex items-center gap-2 min-w-0 text-neutral-500"><span class="text-neutral-400">${icon}</span>${content}</div>`
}

const A_COPY_BTN =
  'shrink-0 w-8 h-8 -my-1 flex items-center justify-center rounded-lg text-neutral-400 hover:text-brand-blue hover:bg-neutral-100 transition'

function restaurantListHtml() {
  if (state.restaurants.length === 0) {
    return emptyStateHtml('🍽️', 'Nenhum restaurante cadastrado ainda. Cadastre o primeiro ao lado (ou acima, no celular).')
  }
  const list = filteredRestaurants()
  if (list.length === 0) {
    const q = state.searchQuery.trim()
    return emptyStateHtml('🔍', q ? `Nenhum restaurante encontrado para "${q}".` : 'Nenhum restaurante neste filtro.')
  }
  return `
    <div class="space-y-3">
      ${list
        .map(
          (r) => `
        <article class="card-hover fade-slide-in bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div class="flex items-start gap-3 sm:gap-4">
            ${
              r.logo_url
                ? `<img src="${escapeHtml(r.logo_url)}" alt="" class="w-12 h-12 rounded-full object-cover border border-neutral-200 shrink-0" />`
                : `<div class="w-12 h-12 rounded-full bg-brand-blue/10 text-brand-blue font-bold flex items-center justify-center text-lg shrink-0">${escapeHtml(r.name.trim().charAt(0).toUpperCase() || '?')}</div>`
            }
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-neutral-900 leading-snug break-words min-w-0">${escapeHtml(r.name)}</h3>
                <span class="shrink-0 mt-0.5">${restaurantStatusPill(r.is_active)}</span>
              </div>
              <div class="mt-2 space-y-1 text-sm">
                ${restaurantInfoRow(
                  aIcon('link'),
                  `<a href="${escapeHtml(menuShareUrl(r.slug))}" target="_blank" rel="noreferrer" class="underline truncate hover:text-brand-blue transition">Ver cardápio público</a>
                   <button data-copy-id="${r.id}" data-copy-kind="menu" title="Copiar link do cardápio" aria-label="Copiar link do cardápio" class="${A_COPY_BTN}">${aIcon('copy', 15)}</button>`
                )}
                ${restaurantInfoRow(
                  aIcon('panel'),
                  `<a href="${escapeHtml(panelUrl())}" target="_blank" rel="noreferrer" class="underline truncate text-brand-blue hover:opacity-80 transition">Abrir painel</a>
                   <button data-copy-id="${r.id}" data-copy-kind="panel" title="Copiar link do painel" aria-label="Copiar link do painel" class="${A_COPY_BTN}">${aIcon('copy', 15)}</button>
                   ${r.auth_user_id ? '' : '<span class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sem acesso</span>'}`
                )}
                ${restaurantInfoRow(
                  aIcon('phone'),
                  `${
                    r.whatsapp
                      ? `<span class="truncate">${escapeHtml(maskPhone(r.whatsapp))}</span>`
                      : '<span class="italic text-neutral-400 truncate">Sem WhatsApp</span>'
                  }
                   <button data-action="whatsapp" data-id="${r.id}" title="Editar WhatsApp" aria-label="Editar WhatsApp" class="${A_COPY_BTN}">${aIcon('edit', 15)}</button>`
                )}
              </div>
            </div>
          </div>
          <div class="mt-4 pt-4 border-t border-neutral-100 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <button data-action="qr" data-id="${r.id}" class="text-sm bg-brand-blue/10 text-brand-blue font-medium rounded-lg px-3 sm:px-3.5 min-h-[44px] sm:min-h-0 py-2 leading-tight hover:bg-brand-blue/20 transition">QR Code</button>
            <button data-action="mesas" data-id="${r.id}" class="text-sm bg-brand-orange/10 text-brand-orange font-medium rounded-lg px-3 sm:px-3.5 min-h-[44px] sm:min-h-0 py-2 leading-tight hover:bg-brand-orange/20 transition">Mesas</button>
            <button data-action="toggle" data-id="${r.id}" class="text-sm bg-neutral-100 text-neutral-600 font-medium rounded-lg px-3 sm:px-3.5 min-h-[44px] sm:min-h-0 py-2 leading-tight hover:bg-neutral-200 transition">${r.is_active ? 'Desativar' : 'Ativar'}</button>
            <button data-action="access" data-id="${r.id}" class="text-sm bg-brand-red/10 text-brand-red font-medium rounded-lg px-3 sm:px-3.5 min-h-[44px] sm:min-h-0 py-2 leading-tight hover:bg-brand-red/20 transition">Gerar acesso provisório</button>
          </div>
        </article>
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
    <div class="space-y-2.5">
      ${state.leads
        .map((l) => {
          const digits = l.phone.replace(/\D/g, '')
          return `
        <div class="fade-slide-in border border-neutral-200 rounded-xl px-4 py-3 space-y-2">
          <div class="flex items-baseline justify-between gap-3">
            <p class="font-medium text-neutral-900 break-words min-w-0">${escapeHtml(l.name)}</p>
            <p class="text-[11px] text-neutral-400 shrink-0">${new Date(l.created_at).toLocaleDateString('pt-BR')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <a href="tel:${escapeHtml(digits)}" class="inline-flex items-center gap-1.5 text-brand-blue hover:underline whitespace-nowrap">${aIcon('phone', 14)}${escapeHtml(l.phone)}</a>
            <a href="mailto:${escapeHtml(l.email)}" class="inline-flex items-center gap-1.5 text-brand-blue hover:underline min-w-0"><span class="shrink-0">${aIcon('mail', 14)}</span><span class="break-words min-w-0">${escapeHtml(l.email)}</span></a>
          </div>
          ${
            digits.length >= 10
              ? `<a href="https://wa.me/55${escapeHtml(digits)}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition rounded-lg px-3 py-1.5">${A_ICON_WHATSAPP}Chamar no WhatsApp</a>`
              : ''
          }
        </div>
      `
        })
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
  if (header) header.textContent = `Leads (${state.leads.length})`
  // O card "Leads" do topo também mostra a contagem.
  const statLeads = document.getElementById('stat-leads')
  if (statLeads) statLeads.textContent = state.leads.length
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
                <div class="w-8 h-8 border-2 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin"></div>
                <p class="text-sm">Gerando QR Code...</p>
              </div>`
        }
        <div class="flex items-center gap-1.5 justify-center text-xs text-neutral-500">
          <span class="truncate max-w-[200px]">${escapeHtml(menuUrl(r.slug))}</span>
          <button id="qr-copy-btn" title="Copiar link" class="text-neutral-400 hover:text-brand-blue transition shrink-0">⧉</button>
        </div>
        <p class="text-[11px] text-neutral-400 -mt-1">Pra colar no espaço do QR Code dos acrílicos de mesa (folheto "Escaneie e papeia"): imprima este PNG num adesivo de <strong>25 × 25mm</strong> (faixa segura: 22–27mm).</p>
        <div class="flex gap-2">
          ${
            state.qrDataUrl
              ? `<a href="${state.qrDataUrl}" download="qrcode-${escapeHtml(r.slug)}.png" class="flex-1 bg-brand-blue text-white text-sm font-semibold rounded-lg py-2 hover:opacity-90 transition">Baixar PNG</a>`
              : ''
          }
          <button id="qr-close-btn" class="flex-1 bg-neutral-100 text-neutral-600 text-sm font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">Fechar</button>
        </div>
      </div>
    </div>
  `
}

// ---- WhatsApp do restaurante (restaurants.whatsapp, migration 0013) ----
// Número que recebe os pedidos enviados pelo botão "Enviar pedido no
// WhatsApp" do carrinho (cliente/cardapio.js). O restaurante também pode
// editar isso sozinho no próprio painel (restaurante/painel.js) — esse modal
// aqui é só pra você (admin) poder cadastrar/corrigir sem depender disso.
function whatsappModalHtml() {
  const r = state.whatsappRestaurant
  return `
    <div id="whatsapp-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <form id="whatsapp-form" class="modal-box bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
        <h3 class="font-semibold text-lg">WhatsApp — ${escapeHtml(r.name)}</h3>
        <p class="text-sm text-neutral-500">Número que recebe os pedidos enviados pelo cardápio direto no WhatsApp. Deixe em branco para remover.</p>
        <input
          id="whatsapp-modal-input"
          value="${escapeHtml(maskPhone(state.whatsappEditDraft))}"
          placeholder="(11) 91234-5678"
          inputmode="numeric"
          autofocus
          class="w-full border border-neutral-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
        />
        <div class="flex gap-2 pt-1">
          <button type="submit" class="flex-1 bg-brand-blue text-white font-semibold rounded-lg py-2 hover:opacity-90 transition">Salvar</button>
          <button type="button" id="whatsapp-close-btn" class="flex-1 bg-neutral-100 text-neutral-600 font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">Cancelar</button>
        </div>
      </form>
    </div>
  `
}

// ---- Acesso provisório do restaurante (login + senha) ----

function accessModalHtml() {
  const r = state.accessRestaurant
  if (state.accessPhase === 'result') {
    const { login, password } = state.accessResult
    return `
      <div id="access-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="modal-box bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
          <h3 class="font-semibold text-lg">Acesso provisório — ${escapeHtml(r.name)}</h3>
          <p class="text-sm text-neutral-500">Envie estes dados ao dono. No primeiro acesso ele vai cadastrar o próprio e-mail e uma nova senha.</p>
          <dl class="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2 text-sm">
            <div><dt class="text-xs text-neutral-400">Endereço do painel</dt><dd class="break-all font-medium">${escapeHtml(panelUrl())}</dd></div>
            <div><dt class="text-xs text-neutral-400">Login</dt><dd class="font-mono font-semibold">${escapeHtml(login)}</dd></div>
            <div><dt class="text-xs text-neutral-400">Senha provisória</dt><dd class="font-mono font-semibold">${escapeHtml(password)}</dd></div>
          </dl>
          <p class="text-xs text-brand-red">⚠️ A senha só aparece agora — não fica salva em lugar nenhum. Se perder, gere outro acesso provisório.</p>
          <div class="flex gap-2">
            <button type="button" id="access-copy-btn" class="flex-1 bg-brand-blue text-white font-semibold rounded-lg py-2 hover:opacity-90 transition">Copiar dados</button>
            <button type="button" id="access-close-btn" class="flex-1 bg-neutral-100 text-neutral-600 font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">Fechar</button>
          </div>
        </div>
      </div>
    `
  }
  return `
    <div id="access-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <form id="access-form" class="modal-box bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
        <h3 class="font-semibold text-lg">Gerar acesso provisório — ${escapeHtml(r.name)}</h3>
        <p class="text-sm text-neutral-500">${
          state.accessIsNew
            ? 'Restaurante cadastrado! Falta gerar o login e a senha provisórios dele.'
            : 'Cria um login e uma senha provisórios. Se o restaurante já tem e-mail e senha próprios, eles deixam de valer e o dono precisa refazer o primeiro acesso.'
        }</p>
        <input
          id="access-password-input"
          type="password"
          autocomplete="current-password"
          autofocus
          placeholder="Repita a sua senha de admin"
          class="w-full border border-neutral-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
        />
        ${state.accessError ? `<p class="text-brand-red text-sm flex items-center gap-1.5">⚠️ ${escapeHtml(state.accessError)}</p>` : ''}
        <div class="flex gap-2 pt-1">
          <button type="submit" ${state.accessLoading ? 'disabled' : ''} class="flex-1 bg-brand-blue text-white font-semibold rounded-lg py-2 hover:opacity-90 transition disabled:opacity-50">${state.accessLoading ? 'Gerando...' : 'Gerar acesso'}</button>
          <button type="button" id="access-close-btn" class="flex-1 bg-neutral-100 text-neutral-600 font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">${state.accessIsNew ? 'Depois' : 'Cancelar'}</button>
        </div>
      </form>
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
              class="w-full border border-neutral-300 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
            />
          </div>
          <button type="submit" class="bg-brand-blue text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:opacity-90 transition shrink-0">Gerar</button>
        </form>
        <p class="text-xs text-neutral-400 -mt-3">Cria as mesas 1 a N. Mesas que já existem (inclusive renomeadas) não são duplicadas — dá pra gerar de novo com um número maior só pra adicionar mesas novas.</p>
        ${state.mesasError ? `<p class="text-brand-red text-sm flex items-center gap-1.5">⚠️ ${escapeHtml(state.mesasError)}</p>` : ''}

        <div id="mesas-list">${mesasListHtml()}</div>

        ${
          state.mesasList.length > 0
            ? `<a href="mesas-print.html?restaurant_id=${encodeURIComponent(r.id)}" target="_blank" rel="noreferrer" class="block text-center bg-brand-orange text-white text-sm font-semibold rounded-lg py-2.5 hover:opacity-90 transition">Gerar artes das mesas</a>`
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
      <button data-mesa-action="rename" data-mesa-id="${m.id}" title="Renomear" class="text-neutral-400 hover:text-brand-blue w-7 h-7 flex items-center justify-center rounded-full transition shrink-0">✎</button>
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
      `<a href="mesas-print.html?restaurant_id=${encodeURIComponent(state.mesasRestaurant.id)}" target="_blank" rel="noreferrer" class="block text-center bg-brand-orange text-white text-sm font-semibold rounded-lg py-2.5 hover:opacity-90 transition">Gerar artes das mesas</a>`
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
    loginTurnstile = mountTurnstile(document.getElementById('login-turnstile'))
    return
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    location.reload()
  })

  document.getElementById('name-input').addEventListener('input', (e) => {
    state.nameDraft = e.target.value
    document.getElementById('slug-preview').innerHTML = slugPreviewText(state.nameDraft)
  })
  document.getElementById('create-whatsapp-input').addEventListener('input', (e) => {
    state.whatsappDraft = maskPhone(e.target.value)
    e.target.value = state.whatsappDraft
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

  // Filtros por status (Todos / Ativos / Inativos / Sem acesso): só a barra de
  // chips e a lista são redesenhadas — a busca digitada não se perde.
  const filters = document.getElementById('restaurant-filters')
  if (filters) {
    filters.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-filter]')
      if (!chip) return
      state.statusFilter = chip.getAttribute('data-filter')
      filters.innerHTML = restaurantFiltersHtml()
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

  const accessOverlay = document.getElementById('access-overlay')
  if (accessOverlay) {
    accessOverlay.addEventListener('click', (e) => {
      if (e.target === accessOverlay) closeAccessModal()
    })
    document.getElementById('access-close-btn').addEventListener('click', closeAccessModal)
    const accessForm = document.getElementById('access-form')
    if (accessForm) accessForm.addEventListener('submit', handleAccessSubmit)
    const accessCopy = document.getElementById('access-copy-btn')
    if (accessCopy) accessCopy.addEventListener('click', copyAccessCredentials)
  }

  const whatsappOverlay = document.getElementById('whatsapp-overlay')
  if (whatsappOverlay) {
    whatsappOverlay.addEventListener('click', (e) => {
      if (e.target === whatsappOverlay) closeWhatsappModal()
    })
    document.getElementById('whatsapp-close-btn').addEventListener('click', closeWhatsappModal)
    document.getElementById('whatsapp-form').addEventListener('submit', handleWhatsappSubmit)
    document.getElementById('whatsapp-modal-input').addEventListener('input', (e) => {
      state.whatsappEditDraft = maskPhone(e.target.value)
      e.target.value = state.whatsappEditDraft
    })
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
      if (action === 'whatsapp') openWhatsappModal(restaurant)
      if (action === 'toggle') toggleActive(restaurant)
      if (action === 'access') openAccessModal(restaurant)
    })
  })

  document.querySelectorAll('[data-copy-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const restaurant = state.restaurants.find((r) => r.id === btn.getAttribute('data-copy-id'))
      if (!restaurant) return
      const kind = btn.getAttribute('data-copy-kind')
      const link = kind === 'panel' ? panelUrl() : menuShareUrl(restaurant.slug)
      copyLinkWithFeedback(link)
    })
  })
}

async function copyLinkWithFeedback(link) {
  const ok = await copyToClipboard(link)
  showToast(ok ? 'Link copiado!' : 'Não deu para copiar — copie manualmente.', ok ? 'success' : 'error')
}

// Gate simples de MVP: a senha em si nunca fica no frontend — é comparada
// dentro da Edge Function admin-login, contra o secret SENHA_ADMIN
// (configurado só no Supabase, nunca em config.js). O navegador manda o que
// foi digitado e só recebe { ok: true/false } de volta. Ainda não é
// autenticação real (sem token de sessão assinado — ver aviso no README);
// antes de produção, migrar para Supabase Auth.
// Widget do Turnstile da tela de login (recriado a cada render da tela).
let loginTurnstile = null

function formatWait(seconds) {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1 ? 'cerca de 1 minuto' : `${minutes} minutos`
}

async function handleLogin(e) {
  e.preventDefault()
  const password = document.getElementById('password-input').value
  state.loginError = ''

  const turnstileToken = loginTurnstile ? loginTurnstile.getToken() : ''
  if (turnstileEnabled() && !turnstileToken) {
    // Sem re-render: recriar a tela reiniciaria a verificação que já está rodando.
    document.getElementById('login-error').innerHTML =
      '<p class="text-brand-red text-sm flex items-start gap-1.5">⚠️ <span>Aguarde a verificação de segurança terminar e tente de novo.</span></p>'
    return
  }

  const submitBtn = document.querySelector('#login-form button[type="submit"]')
  submitBtn.disabled = true
  submitBtn.textContent = 'Verificando...'

  try {
    const anonKey = window.PEDEAI_CONFIG.SUPABASE_ANON_KEY
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/admin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ senha: password, turnstile_token: turnstileToken }),
    })
    const data = await res.json()

    if (data.ok) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
      state.authenticated = true
      render()
      loadRestaurants()
      loadLeads()
      return
    }
    if (data.error === 'rate_limited') {
      state.loginError = `Muitas tentativas erradas. Tente de novo em ${formatWait(data.retry_after || 900)}.`
    } else if (data.error === 'captcha_failed') {
      state.loginError = 'Não foi possível validar a verificação de segurança. Tente de novo.'
    } else {
      state.loginError = 'Senha incorreta.'
    }
  } catch {
    state.loginError = 'Não deu para verificar a senha agora. Tenta de novo.'
  }
  render()
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
  const whatsapp = state.whatsappDraft.replace(/\D/g, '') || null
  const { data: created, error } = await supabaseClient.from('restaurants').insert({ name, slug, whatsapp }).select().single()

  if (error) {
    state.formError = error.message
  } else {
    state.nameDraft = ''
    state.whatsappDraft = ''
    showToast(`"${name}" cadastrado!`, 'success')
    // Restaurante novo já nasce sem acesso: abre o modal pra gerar o login
    // provisório (pede a senha do admin de novo).
    openAccessModal(created, { isNew: true })
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

function openAccessModal(r, { isNew = false } = {}) {
  state.accessRestaurant = r
  state.accessPhase = 'password'
  state.accessLoading = false
  state.accessError = ''
  state.accessResult = null
  state.accessIsNew = isNew
  render()
}

function closeAccessModal() {
  state.accessRestaurant = null
  state.accessResult = null
  render()
  loadRestaurants()
}

// A senha de admin é enviada a cada geração (não fica guardada em lugar
// nenhum no navegador) e conferida no servidor, contra o secret SENHA_ADMIN,
// na Edge Function admin-generate-access — que também é quem mexe no
// Supabase Auth (service_role nunca sai do servidor).
async function handleAccessSubmit(e) {
  e.preventDefault()
  const senha = document.getElementById('access-password-input').value
  if (!senha) return
  state.accessLoading = true
  state.accessError = ''
  render()

  try {
    const anonKey = window.PEDEAI_CONFIG.SUPABASE_ANON_KEY
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/admin-generate-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ senha, restaurant_id: state.accessRestaurant.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.ok) {
      state.accessResult = { login: data.login, password: data.password }
      state.accessPhase = 'result'
    } else {
      state.accessError = data.error || 'Não foi possível gerar o acesso.'
    }
  } catch {
    state.accessError = 'Não deu para gerar o acesso agora. Tente de novo.'
  }
  state.accessLoading = false
  render()
}

async function copyAccessCredentials() {
  const { login, password } = state.accessResult
  const text = `Acesso ao painel do ${state.accessRestaurant.name}
Endereço: ${panelUrl()}
Login: ${login}
Senha provisória: ${password}

No primeiro acesso você vai cadastrar seu e-mail e uma nova senha.`
  const ok = await copyToClipboard(text)
  showToast(ok ? 'Dados copiados!' : 'Não deu para copiar — copie manualmente.', ok ? 'success' : 'error')
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

function openWhatsappModal(r) {
  state.whatsappRestaurant = r
  state.whatsappEditDraft = r.whatsapp || ''
  render()
}

function closeWhatsappModal() {
  state.whatsappRestaurant = null
  render()
}

async function handleWhatsappSubmit(e) {
  e.preventDefault()
  const digits = state.whatsappEditDraft.replace(/\D/g, '')
  const id = state.whatsappRestaurant.id
  const { error } = await supabaseClient.from('restaurants').update({ whatsapp: digits || null }).eq('id', id)
  if (error) showToast('Erro ao salvar WhatsApp.', 'error')
  else showToast('WhatsApp atualizado!', 'success')
  closeWhatsappModal()
  await loadRestaurants()
}

render()
if (state.authenticated) {
  loadRestaurants()
  loadLeads()
}
