// painel.js — página restaurante/index.html?token=... (equivalente ao antigo /r/:accessToken)

const root = document.getElementById('root')
const accessToken = new URLSearchParams(location.search).get('token')

let restaurantClient = null
let restaurant = null

// Ícones — SVG, não emoji, pra ficar consistente com o cardápio público.
const ICON_STAR = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/></svg>`
const ICON_SEARCH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`
const ICON_LOGOUT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`

let productsState = []
let productsFilter = 'all' // 'all' | 'available' | 'unavailable' — ver filteredProductsState()
let productsSearch = ''
let productsSort = 'category' // 'category' | 'name' | 'price'
let categoriesState = []
let newCategoryName = ''
let renamingCategoryId = null
let renamingCategoryDraft = ''
let editingProduct = null
let productFormError = ''
let savingProduct = false
let imagePreviewUrl = null
let productHasImage = true // controla se o campo de upload aparece no formulário de produto

let logoSaving = false
let themeColorSaving = false

async function init() {
  if (!accessToken) {
    root.innerHTML = notFoundHtml('Link inválido ou revogado. Fale com o administrador.')
    return
  }

  // Cliente autenticado via header x-restaurant-token (ver js/supabase-client.js).
  // As policies de RLS (current_restaurant_token(), migrations 0002/0003) usam
  // esse token para liberar escrita apenas nas linhas deste restaurante.
  restaurantClient = createRestaurantClient(accessToken)

  root.innerHTML = loadingHtml()

  const { data } = await restaurantClient
    .from('restaurants')
    .select('*')
    .eq('access_token', accessToken)
    .maybeSingle()

  restaurant = data || 'not_found'

  if (restaurant === 'not_found') {
    root.innerHTML = notFoundHtml('Link inválido ou revogado. Fale com o administrador.')
    return
  }

  // Cor de destaque cadastrada pelo restaurante (ver js/util.js) — o próprio
  // painel também usa "brand-orange" (botão "Novo produto", badge Destaque,
  // preço), então reflete aqui também, não só no cardápio público.
  applyThemeColor(restaurant.theme_color)

  renderPanel()
}

// Logo do restaurante (se cadastrada, ver identityManagerHtml) + logo do
// PapeiAI + nome do restaurante em destaque, no cabeçalho — separado em
// função própria pra poder atualizar só isso (renderHeaderIdentity) quando a
// logo muda, sem re-renderizar o painel inteiro (que recarregaria produtos e
// categorias à toa).
function headerIdentityHtml() {
  return `
    ${
      restaurant.logo_url
        ? `<img src="${escapeHtml(restaurant.logo_url)}" alt="" class="w-11 h-11 rounded-full object-cover border border-neutral-200 shrink-0" />`
        : ''
    }
    <div class="min-w-0">
      <div class="opacity-60">${renderLogo({ size: 'sm' })}</div>
      <h1 class="text-lg sm:text-xl font-extrabold text-neutral-900 leading-tight truncate mt-0.5">${escapeHtml(restaurant.name)}</h1>
    </div>
  `
}

function renderHeaderIdentity() {
  const el = document.getElementById('header-identity')
  if (el) el.innerHTML = headerIdentityHtml()
}

function renderPanel() {
  root.innerHTML = `
    <div class="min-h-screen bg-neutral-50">
      <header class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div class="h-1 bg-gradient-to-r from-brand-orange to-brand-red" aria-hidden="true"></div>
        <div class="max-w-5xl mx-auto px-6 py-4">
          <div class="flex items-center justify-between gap-4">
            <div id="header-identity" class="flex items-center gap-3 min-w-0">${headerIdentityHtml()}</div>
            <div class="flex items-center gap-3 shrink-0">
              <a href="${escapeHtml(menuUrl(restaurant.slug))}" target="_blank" rel="noreferrer" class="text-xs text-brand-blue underline hover:opacity-80 transition">Ver cardápio público ↗</a>
              <button id="logout-btn" title="Sair (limpa o link deste painel do navegador)" class="text-neutral-400 hover:text-brand-red hover:bg-neutral-100 transition w-9 h-9 flex items-center justify-center rounded-full shrink-0">${ICON_LOGOUT}</button>
            </div>
          </div>
        </div>
      </header>

      <main class="max-w-5xl mx-auto px-6 py-8" id="tab-content"></main>
    </div>
  `

  document.getElementById('logout-btn').addEventListener('click', handleLogout)

  renderTabContent()
}

// "Sair" não existe como sessão de verdade neste MVP (sem Supabase Auth) — o
// acesso É o link com ?token=. Isso só limpa o token da barra de endereço
// deste navegador, então avisamos antes: sem o link salvo em outro lugar
// (ex: o admin, que gerou o link original), não dá pra voltar.
async function handleLogout() {
  const confirmed = await showConfirm({
    title: 'Sair',
    message: 'Isso limpa o link deste painel neste navegador. Você vai precisar do link original (com o token) para entrar de novo.',
    confirmLabel: 'Sair',
    danger: true,
  })
  if (!confirmed) return
  location.href = location.pathname
}

function renderTabContent() {
  const container = document.getElementById('tab-content')
  container.innerHTML = productsTabHtml()
  bindProductsTabEvents()
  loadCategories()
  loadProducts()
}

// ---- Aba de produtos (categorias + lista) ----

function productsTabHtml() {
  return `
    <div class="space-y-4">
      <div id="identity-manager">${identityManagerHtml()}</div>
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-extrabold text-neutral-900">Produtos</h2>
        <button id="new-product-btn" class="bg-brand-orange text-white text-sm font-semibold rounded-lg px-4 py-2 shadow-brand-ai hover:opacity-90 active:scale-[0.99] transition">+ Novo produto</button>
      </div>
      <div id="categories-manager">${categoriesManagerHtml()}</div>
      <div id="products-toolbar">${productsToolbarHtml()}</div>
      <div id="products-list" class="space-y-5">${skeletonCardsHtml(2)}</div>
    </div>
  `
}

// ---- Identidade visual (logo do restaurante) ----

function identityManagerHtml() {
  return `
    <div class="bg-white border border-neutral-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <p class="text-sm font-semibold text-neutral-700">Identidade visual</p>
      <div class="flex items-center gap-5">
        <div id="logo-preview" class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl shrink-0 overflow-hidden border border-neutral-200 ${restaurant.logo_url ? '' : 'img-placeholder text-4xl'}">
          ${restaurant.logo_url ? `<img src="${escapeHtml(restaurant.logo_url)}" class="w-full h-full object-contain" />` : '🏠'}
        </div>
        <div class="flex-1 min-w-0 space-y-2.5">
          <p class="text-sm text-neutral-500 leading-relaxed">Aparece no topo do cardápio público e, se cadastrada, no cabeçalho deste painel, ao lado do nome do restaurante.</p>
          <div class="flex items-center gap-4">
            <label class="text-sm font-medium bg-neutral-100 hover:bg-neutral-200 rounded-lg px-4 py-2 cursor-pointer transition ${logoSaving ? 'opacity-50 pointer-events-none' : ''}">
              ${logoSaving ? 'Enviando...' : restaurant.logo_url ? 'Trocar logo' : 'Enviar logo'}
              <input type="file" accept="image/*" id="logo-file-input" class="hidden" ${logoSaving ? 'disabled' : ''} />
            </label>
            ${
              restaurant.logo_url
                ? `<button id="logo-remove-btn" ${logoSaving ? 'disabled' : ''} class="text-sm text-brand-red hover:underline transition disabled:opacity-50">Remover</button>`
                : ''
            }
          </div>
        </div>
      </div>
      <div class="pt-4 border-t border-neutral-100 space-y-2.5">
        <p class="text-sm font-semibold text-neutral-700">Cor de destaque</p>
        <p class="text-sm text-neutral-500 leading-relaxed">Substitui o laranja padrão em botões, preços e destaques do cardápio público e deste painel. O tema do cardápio continua escuro.</p>
        <div class="flex items-center gap-3 flex-wrap">
          <input type="color" id="theme-color-input" value="${escapeHtml(normalizeHexColor(restaurant.theme_color) || '#FF6823')}" title="Escolher cor" class="w-10 h-10 rounded-lg border border-neutral-200 cursor-pointer p-0.5 ${themeColorSaving ? 'opacity-50 pointer-events-none' : ''}" />
          <input type="text" id="theme-color-text" value="${escapeHtml(normalizeHexColor(restaurant.theme_color) || '#FF6823')}" maxlength="7" placeholder="#FF6823" ${themeColorSaving ? 'disabled' : ''} class="w-28 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-blue transition disabled:opacity-50" />
          <button type="button" id="theme-color-reset" ${themeColorSaving ? 'disabled' : ''} class="text-sm text-neutral-500 hover:underline transition disabled:opacity-50">Restaurar padrão</button>
          ${themeColorSaving ? '<span class="text-xs text-neutral-400">Salvando...</span>' : ''}
        </div>
      </div>
    </div>
  `
}

// "#RRGGBB" válido (com ou sem "#" na entrada) → "#RRGGBB" maiúsculo, ou null
// se inválido. Mesmo formato exigido pela constraint da migration 0012
// (restaurants_theme_color_format).
function normalizeHexColor(value) {
  if (!value) return null
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  return match ? `#${match[1].toUpperCase()}` : null
}

function renderIdentityManager() {
  const el = document.getElementById('identity-manager')
  if (el) el.innerHTML = identityManagerHtml()
}

async function handleLogoFileChange(e) {
  const file = e.target.files[0]
  if (!file) return
  logoSaving = true
  renderIdentityManager()

  try {
    // Mesma convenção de path do bucket "products": logos/{restaurant_id}/{arquivo}
    // — as policies de storage.objects (migration 0009) exigem esse prefixo.
    const path = `${restaurant.id}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await restaurantClient.storage.from('logos').upload(path, file)
    if (uploadError) throw uploadError
    const { data: publicUrlData } = restaurantClient.storage.from('logos').getPublicUrl(path)
    const logo_url = publicUrlData.publicUrl

    const { error } = await restaurantClient.from('restaurants').update({ logo_url }).eq('id', restaurant.id)
    if (error) throw error

    restaurant.logo_url = logo_url
    showToast('Logo atualizada!', 'success')
  } catch (err) {
    showToast('Erro ao enviar logo: ' + errorMessage(err), 'error')
  }
  logoSaving = false
  renderIdentityManager()
  renderHeaderIdentity()
}

async function handleLogoRemove() {
  const confirmed = await showConfirm({
    title: 'Remover logo',
    message: 'O cardápio público volta a mostrar só o nome do restaurante em texto. Continuar?',
    confirmLabel: 'Remover',
    danger: true,
  })
  if (!confirmed) return

  const { error } = await restaurantClient.from('restaurants').update({ logo_url: null }).eq('id', restaurant.id)
  if (error) {
    showToast('Erro ao remover logo.', 'error')
    return
  }
  restaurant.logo_url = null
  showToast('Logo removida.', 'success')
  renderIdentityManager()
  renderHeaderIdentity()
}

const DEFAULT_THEME_COLOR = '#FF6823'

// Salva a cor de destaque (restaurants.theme_color, migration 0012). Chamado
// no "change" do color picker, no Enter/blur do campo de texto e no botão
// "Restaurar padrão" — sempre a versão normalizada (#RRGGBB maiúsculo), pra
// bater com a constraint do banco.
async function saveThemeColor(rawValue) {
  const normalized = normalizeHexColor(rawValue)
  if (!normalized) {
    showToast('Cor inválida — use o formato #RRGGBB.', 'error')
    renderIdentityManager()
    return
  }
  if (normalized === normalizeHexColor(restaurant.theme_color)) return

  themeColorSaving = true
  renderIdentityManager()

  const { error } = await restaurantClient.from('restaurants').update({ theme_color: normalized }).eq('id', restaurant.id)
  themeColorSaving = false

  if (error) {
    showToast('Erro ao salvar cor.', 'error')
    renderIdentityManager()
    return
  }

  restaurant.theme_color = normalized
  showToast('Cor de destaque atualizada!', 'success')
  renderIdentityManager()
}

// ---- Categorias (seções do cardápio) ----

function categoriesManagerHtml() {
  return `
    <div class="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-2">
      <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Categorias (seções do cardápio)</p>
      <div class="flex items-center gap-2 overflow-x-auto scroll-contain pb-1">
        ${categoriesState.map(categoryChipHtml).join('')}
        <form id="new-category-form" class="flex items-center gap-1.5 shrink-0">
          <input
            id="new-category-input"
            value="${escapeHtml(newCategoryName)}"
            placeholder="Nova categoria"
            class="w-32 border border-neutral-300 rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
          />
          <button type="submit" title="Adicionar categoria" class="shrink-0 bg-brand-blue text-white text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center hover:opacity-90 transition">+</button>
        </form>
      </div>
      ${
        categoriesState.length === 0
          ? '<p class="text-xs text-neutral-400">Sem categorias ainda — produtos aparecem numa lista única, sem seções, até você criar a primeira.</p>'
          : ''
      }
    </div>
  `
}

function categoryChipHtml(c) {
  if (renamingCategoryId === c.id) {
    return `
      <form data-rename-form="${c.id}" class="flex items-center gap-1 bg-neutral-100 rounded-full pl-3 pr-1 py-1 shrink-0">
        <input data-rename-input value="${escapeHtml(renamingCategoryDraft)}" class="bg-transparent text-sm w-28 focus:outline-none" />
        <button type="submit" title="Salvar" class="text-emerald-600 text-sm w-7 h-7 flex items-center justify-center hover:bg-emerald-50 rounded-full transition">✓</button>
        <button type="button" data-cancel-rename="${c.id}" title="Cancelar" class="text-neutral-400 text-sm w-7 h-7 flex items-center justify-center hover:bg-neutral-200 rounded-full transition">✕</button>
      </form>
    `
  }
  return `
    <span class="inline-flex items-center gap-0.5 bg-neutral-100 text-neutral-700 text-sm rounded-full pl-3 pr-1 py-1 shrink-0">
      ${escapeHtml(c.name)}
      <button data-edit-category="${c.id}" title="Renomear" class="text-neutral-400 hover:text-brand-blue w-7 h-7 flex items-center justify-center rounded-full transition">✎</button>
      <button data-delete-category="${c.id}" title="Excluir" class="text-neutral-400 hover:text-brand-red w-7 h-7 flex items-center justify-center rounded-full transition">✕</button>
    </span>
  `
}

function renderCategoriesManager() {
  const el = document.getElementById('categories-manager')
  if (el) el.innerHTML = categoriesManagerHtml()
}

async function loadCategories() {
  const { data, error } = await restaurantClient
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) showToast('Erro ao carregar categorias.', 'error')
  categoriesState = data || []
  renderCategoriesManager()
  refreshProductsListDisplay()
}

async function handleCategoriesManagerSubmit(e) {
  e.preventDefault()

  if (e.target.id === 'new-category-form') {
    const name = newCategoryName.trim()
    if (!name) return
    const { error } = await restaurantClient
      .from('categories')
      .insert({ restaurant_id: restaurant.id, name, sort_order: categoriesState.length })
    if (error) showToast('Erro ao criar categoria.', 'error')
    else showToast('Categoria criada!', 'success')
    newCategoryName = ''
    await loadCategories()
    return
  }

  const renameId = e.target.getAttribute('data-rename-form')
  if (renameId) {
    const name = renamingCategoryDraft.trim()
    renamingCategoryId = null
    if (!name) {
      renderCategoriesManager()
      return
    }
    const { error } = await restaurantClient.from('categories').update({ name }).eq('id', renameId)
    if (error) showToast('Erro ao renomear categoria.', 'error')
    await loadCategories()
  }
}

function handleCategoriesManagerClick(e) {
  const editBtn = e.target.closest('[data-edit-category]')
  if (editBtn) {
    const cat = categoriesState.find((c) => c.id === editBtn.getAttribute('data-edit-category'))
    if (!cat) return
    renamingCategoryId = cat.id
    renamingCategoryDraft = cat.name
    renderCategoriesManager()
    return
  }

  const cancelBtn = e.target.closest('[data-cancel-rename]')
  if (cancelBtn) {
    renamingCategoryId = null
    renderCategoriesManager()
    return
  }

  const deleteBtn = e.target.closest('[data-delete-category]')
  if (deleteBtn) {
    const cat = categoriesState.find((c) => c.id === deleteBtn.getAttribute('data-delete-category'))
    if (cat) deleteCategory(cat)
  }
}

function handleCategoriesManagerInput(e) {
  if (e.target.id === 'new-category-input') newCategoryName = e.target.value
  if (e.target.hasAttribute('data-rename-input')) renamingCategoryDraft = e.target.value
}

async function deleteCategory(c) {
  const confirmed = await showConfirm({
    title: 'Excluir categoria',
    message: `Remover a categoria "${c.name}"? Os produtos dela voltam a ficar sem categoria (aparecem em "Outros").`,
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!confirmed) return
  const { error } = await restaurantClient.from('categories').delete().eq('id', c.id)
  if (error) showToast('Erro ao excluir categoria.', 'error')
  else showToast('Categoria excluída.', 'success')
  await loadCategories()
}

// ---- Produtos ----

const PRODUCTS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Ativos' },
  { value: 'unavailable', label: 'Desativados' },
]

const PRODUCTS_SORT_OPTIONS = [
  { value: 'category', label: 'Ordenar: categoria' },
  { value: 'name', label: 'Ordenar: nome (A-Z)' },
  { value: 'price', label: 'Ordenar: preço (menor-maior)' },
]

function productsToolbarHtml() {
  const total = productsState.length
  const activeCount = productsState.filter((p) => p.is_available).length
  const inactiveCount = total - activeCount
  return `
    <div class="space-y-2.5">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 [&>svg]:block">${ICON_SEARCH}</span>
        <input
          id="products-search"
          value="${escapeHtml(productsSearch)}"
          placeholder="Buscar produto pelo nome..."
          class="w-full border border-neutral-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue transition"
        />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          ${PRODUCTS_FILTER_OPTIONS.map(
            (opt) => `
            <button data-products-filter="${opt.value}" class="px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              productsFilter === opt.value ? 'bg-brand-blue text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }">${opt.label}</button>
          `
          ).join('')}
        </div>
        <select id="products-sort" class="text-xs font-medium border border-neutral-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue transition">
          ${PRODUCTS_SORT_OPTIONS.map((opt) => `<option value="${opt.value}" ${productsSort === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </div>
      <p class="text-xs text-neutral-400">${total} produto${total === 1 ? '' : 's'} · ${activeCount} ativo${activeCount === 1 ? '' : 's'} · ${inactiveCount} desativado${inactiveCount === 1 ? '' : 's'}</p>
    </div>
  `
}

// Filtro por status + busca por nome — os contadores no topo da lista (ver
// productsToolbarHtml) sempre usam productsState direto (total do cardápio),
// não isso aqui, que é só o que efetivamente aparece na lista.
function filteredProductsState() {
  let items = productsState
  if (productsFilter === 'available') items = items.filter((p) => p.is_available)
  else if (productsFilter === 'unavailable') items = items.filter((p) => !p.is_available)
  const q = productsSearch.trim().toLowerCase()
  if (q) items = items.filter((p) => p.name.toLowerCase().includes(q))
  return items
}

function sortedProductsState(items) {
  if (productsSort === 'name') return [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  if (productsSort === 'price') return [...items].sort((a, b) => a.price - b.price)
  return items
}

function productImageHtml(p) {
  if (p.image_url) {
    return `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-20 h-20 rounded-lg object-cover shrink-0" />`
  }
  return `<div class="img-placeholder w-20 h-20 rounded-lg shrink-0 text-2xl">🍽️</div>`
}

// Badges no topo do card — "Destaque" (preenchido, laranja) e "Desativado"
// (cinza), nessa ordem. Um produto pode ter os dois ao mesmo tempo (ex: dono
// desativa temporariamente um destaque sem tirar o destaque).
function productBadgesHtml(p) {
  const badges = []
  if (p.destaque) {
    badges.push(
      `<span class="inline-flex items-center gap-1 bg-brand-orange text-white text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">${ICON_STAR}Destaque</span>`
    )
  }
  if (!p.is_available) {
    badges.push(
      `<span class="inline-flex items-center gap-1 bg-neutral-200 text-neutral-600 text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0">Desativado</span>`
    )
  }
  if (badges.length === 0) return ''
  return `<div class="flex flex-wrap gap-1.5 mb-1">${badges.join('')}</div>`
}

function productRowHtml(p) {
  const inactive = !p.is_available
  return `
    <div class="fade-slide-in card-hover border rounded-xl p-3.5 flex gap-3.5 ${inactive ? 'bg-neutral-100 border-neutral-200 opacity-60' : 'bg-white border-neutral-200 shadow-sm'}">
      ${productImageHtml(p)}
      <div class="flex-1 min-w-0 flex flex-col">
        ${productBadgesHtml(p)}
        <div class="flex items-start justify-between gap-2">
          <p class="font-semibold truncate ${inactive ? 'text-neutral-500' : 'text-neutral-900'}">${escapeHtml(p.name)}</p>
          <p class="text-sm font-bold shrink-0 ${inactive ? 'text-neutral-400' : 'text-brand-orange'}">R$ ${formatBRL(p.price)}</p>
        </div>
        <p class="text-xs text-neutral-500 line-clamp-1 mt-0.5">${escapeHtml(p.description || '')}</p>
        <div class="flex items-center gap-1.5 mt-2">
          <button data-action="edit" data-id="${p.id}" class="text-xs bg-neutral-100 text-neutral-700 rounded-lg px-2.5 py-1.5 hover:bg-neutral-200 transition">Editar</button>
          <button data-action="toggle" data-id="${p.id}" class="text-xs font-medium rounded-lg px-2.5 py-1.5 transition ${
            p.is_available ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200' : 'bg-emerald-600 text-white hover:opacity-90'
          }">${p.is_available ? 'Desativar' : 'Ativar'}</button>
          <button data-action="delete" data-id="${p.id}" class="text-xs bg-brand-red/10 text-brand-red rounded-lg px-2.5 py-1.5 hover:bg-brand-red/20 transition ml-auto">Excluir</button>
        </div>
      </div>
    </div>
  `
}

// Agrupa produtos pela categoria (mesma lógica usada no cardápio público, ver
// cliente/cardapio.js) — serve de prévia pro restaurante de como vai ficar.
function buildProductGroups(items) {
  if (categoriesState.length === 0) return null
  const groups = categoriesState.map((c) => ({
    id: c.id,
    name: c.name,
    items: items.filter((p) => p.category_id === c.id),
  }))
  const uncategorized = items.filter((p) => !p.category_id || !categoriesState.some((c) => c.id === p.category_id))
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Outros', items: uncategorized })
  return groups.filter((g) => g.items.length > 0)
}

function productGridHtml(items) {
  return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${items.map(productRowHtml).join('')}</div>`
}

function renderProductsList() {
  if (productsState.length === 0) {
    return emptyStateHtml('🍽️', 'Nenhum produto cadastrado ainda. Clique em "+ Novo produto" para começar.')
  }

  const filtered = filteredProductsState()
  if (filtered.length === 0) {
    return emptyStateHtml('🍽️', 'Nenhum produto encontrado.')
  }

  // Ordenação por nome/preço ignora categorias (lista única) — só o padrão
  // "categoria" agrupa em seções, igual ao cardápio público.
  if (productsSort !== 'category') {
    return productGridHtml(sortedProductsState(filtered))
  }

  const groups = buildProductGroups(filtered)
  if (!groups) {
    return productGridHtml(filtered)
  }

  return groups
    .map(
      (g) => `
        <div class="space-y-2.5">
          <p class="text-xs font-semibold uppercase tracking-wide text-neutral-400">${escapeHtml(g.name)} <span class="text-neutral-300 normal-case">(${g.items.length})</span></p>
          ${productGridHtml(g.items)}
        </div>
      `
    )
    .join('')
}

function refreshProductsListDisplay() {
  const list = document.getElementById('products-list')
  if (list) list.innerHTML = renderProductsList()
}

function bindProductsTabEvents() {
  document.getElementById('new-product-btn').addEventListener('click', () => openProductForm(null))

  // Delegado no container (sobrevive à troca de innerHTML ao clicar num
  // filtro, mesmo padrão do categories-manager abaixo). O campo de busca só
  // atualiza a LISTA (não o toolbar inteiro) a cada tecla, pra não perder o
  // foco/cursor do input a cada re-render.
  const productsToolbar = document.getElementById('products-toolbar')
  productsToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-products-filter]')
    if (!btn) return
    productsFilter = btn.getAttribute('data-products-filter')
    productsToolbar.innerHTML = productsToolbarHtml()
    refreshProductsListDisplay()
  })
  productsToolbar.addEventListener('input', (e) => {
    if (e.target.id !== 'products-search') return
    productsSearch = e.target.value
    refreshProductsListDisplay()
  })
  productsToolbar.addEventListener('change', (e) => {
    if (e.target.id !== 'products-sort') return
    productsSort = e.target.value
    refreshProductsListDisplay()
  })

  document.getElementById('products-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const id = btn.getAttribute('data-id')
    const product = productsState.find((p) => p.id === id)
    const action = btn.getAttribute('data-action')
    if (action === 'edit') openProductForm(product)
    if (action === 'toggle') toggleProductAvailable(product)
    if (action === 'delete') deleteProduct(product)
  })

  // Delegado no container: sobrevive às re-renderizações internas do gerenciador
  // de categorias (só o innerHTML muda, o #categories-manager em si não).
  const categoriesManager = document.getElementById('categories-manager')
  categoriesManager.addEventListener('submit', handleCategoriesManagerSubmit)
  categoriesManager.addEventListener('click', handleCategoriesManagerClick)
  categoriesManager.addEventListener('input', handleCategoriesManagerInput)

  // Mesmo padrão de delegação: #identity-manager em si não é recriado, só o
  // innerHTML (ver renderIdentityManager).
  const identityManager = document.getElementById('identity-manager')
  identityManager.addEventListener('change', (e) => {
    if (e.target.id === 'logo-file-input') handleLogoFileChange(e)
    if (e.target.id === 'theme-color-input') saveThemeColor(e.target.value)
  })
  identityManager.addEventListener('click', (e) => {
    if (e.target.closest('#logo-remove-btn')) handleLogoRemove()
    if (e.target.closest('#theme-color-reset')) saveThemeColor(DEFAULT_THEME_COLOR)
  })
  // Pré-visualização ao vivo enquanto arrasta o color picker ou digita o hex
  // — aplica na hora (applyThemeColor, js/util.js) sem salvar ainda; o save
  // de verdade só acontece no "change" (picker) ou Enter/blur (campo texto).
  identityManager.addEventListener('input', (e) => {
    if (e.target.id === 'theme-color-input') {
      const textInput = document.getElementById('theme-color-text')
      if (textInput) textInput.value = e.target.value.toUpperCase()
      applyThemeColor(e.target.value)
      return
    }
    if (e.target.id === 'theme-color-text') {
      const normalized = normalizeHexColor(e.target.value)
      if (!normalized) return
      const colorInput = document.getElementById('theme-color-input')
      if (colorInput) colorInput.value = normalized
      applyThemeColor(normalized)
    }
  })
  identityManager.addEventListener('keydown', (e) => {
    if (e.target.id === 'theme-color-text' && e.key === 'Enter') {
      e.preventDefault()
      saveThemeColor(e.target.value)
    }
  })
  // "blur" não borbulha (bubble) — precisa de capture (terceiro argumento
  // true) pro listener delegado no container conseguir pegar o evento.
  identityManager.addEventListener(
    'blur',
    (e) => {
      if (e.target.id === 'theme-color-text') saveThemeColor(e.target.value)
    },
    true
  )
}

async function loadProducts() {
  const { data, error } = await restaurantClient
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('created_at', { ascending: false })
  if (error) showToast('Erro ao carregar produtos.', 'error')
  productsState = data || []
  refreshProductsListDisplay()
}

async function toggleProductAvailable(p) {
  const { error } = await restaurantClient.from('products').update({ is_available: !p.is_available }).eq('id', p.id)
  if (error) showToast('Erro ao atualizar produto.', 'error')
  loadProducts()
}

async function deleteProduct(p) {
  // order_items.product_id é "on delete set null" (migration 0003) — excluir
  // o produto NUNCA apaga o histórico de pedidos já feitos (o nome/preço já
  // estão salvos em cada item, como snapshot). Mesmo assim avisamos quando o
  // produto já foi pedido, pra o dono decidir com informação: às vezes vale
  // mais desativar (some do cardápio, mas continua editável) do que excluir.
  const { count } = await restaurantClient
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', p.id)
  const orderedTimes = count || 0

  const message =
    orderedTimes > 0
      ? `"${p.name}" já foi pedido ${orderedTimes} ${orderedTimes === 1 ? 'vez' : 'vezes'}. O histórico desses pedidos continua intacto mesmo depois de excluir — mas considere só desativar em vez de excluir, se quiser manter o produto editável. Excluir mesmo assim?`
      : `Remover "${p.name}" do cardápio? Essa ação não pode ser desfeita.`

  const confirmed = await showConfirm({
    title: 'Excluir produto',
    message,
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!confirmed) return
  const { error } = await restaurantClient.from('products').delete().eq('id', p.id)
  if (error) showToast('Erro ao excluir produto.', 'error')
  else showToast('Produto excluído.', 'success')
  loadProducts()
}

// ---- Formulário de produto (modal) ----

function openProductForm(product) {
  editingProduct = product
  productFormError = ''
  savingProduct = false
  imagePreviewUrl = product ? product.image_url : null
  productHasImage = product ? !!product.image_url : true
  renderProductFormModal()
}

function renderProductFormModal() {
  const existing = document.getElementById('product-form-overlay')
  if (existing) existing.remove()
  document.body.insertAdjacentHTML('beforeend', productFormHtml())
  bindProductFormEvents()
}

function productFormHtml() {
  const p = editingProduct
  return `
    <div id="product-form-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <form id="product-form" class="modal-box bg-white rounded-2xl p-6 max-w-md w-full space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 class="font-semibold text-lg">${p ? 'Editar produto' : 'Novo produto'}</h3>
        <input required id="pf-name" value="${escapeHtml(p ? p.name : '')}" placeholder="Nome do produto" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue transition" />
        <textarea id="pf-description" placeholder="Descrição" rows="2" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue transition">${escapeHtml(p ? p.description || '' : '')}</textarea>
        <input required type="number" step="0.01" min="0" id="pf-price" value="${p ? p.price : ''}" placeholder="Preço (R$)" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue transition" />
        <input id="pf-ingredients" value="${escapeHtml(p && p.ingredients ? p.ingredients.join(', ') : '')}" placeholder="Ingredientes (separados por vírgula)" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue transition" />
        <select id="pf-category" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue transition">
          <option value="">Sem categoria (aparece em "Outros")</option>
          ${categoriesState
            .map(
              (c) => `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
            )
            .join('')}
        </select>
        <div class="space-y-2">
          <p class="text-xs font-semibold text-neutral-500">Foto do produto</p>
          <div class="flex gap-2">
            <label data-has-image-option="yes" class="flex-1 flex items-center justify-center text-sm border rounded-lg px-3 py-2 cursor-pointer transition ${productHasImage ? 'border-brand-blue bg-brand-blue/5 text-brand-blue font-medium' : 'border-neutral-300 text-neutral-500'}">
              <input type="radio" name="pf-has-image" value="yes" class="hidden" ${productHasImage ? 'checked' : ''} /> Tem imagem
            </label>
            <label data-has-image-option="no" class="flex-1 flex items-center justify-center text-sm border rounded-lg px-3 py-2 cursor-pointer transition ${!productHasImage ? 'border-brand-blue bg-brand-blue/5 text-brand-blue font-medium' : 'border-neutral-300 text-neutral-500'}">
              <input type="radio" name="pf-has-image" value="no" class="hidden" ${!productHasImage ? 'checked' : ''} /> Não tem imagem
            </label>
          </div>
          <div id="pf-image-section" class="flex items-center gap-3 ${productHasImage ? '' : 'hidden'}">
            <div id="pf-image-preview" class="w-14 h-14 rounded-lg shrink-0 overflow-hidden ${imagePreviewUrl ? '' : 'img-placeholder text-xl'}">
              ${imagePreviewUrl ? `<img src="${escapeHtml(imagePreviewUrl)}" class="w-full h-full object-cover" />` : '🍽️'}
            </div>
            <input type="file" accept="image/*" id="pf-image" class="flex-1 text-xs" />
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="pf-notes" class="text-xs font-semibold text-neutral-500">Observações do restaurante (para o Ari)</label>
            <span id="pf-notes-counter" class="text-xs text-neutral-400">${p && p.notas_restaurante ? p.notas_restaurante.length : 0}/300</span>
          </div>
          <textarea id="pf-notes" rows="2" maxlength="300" placeholder="Ex: contém glúten, servido frio, não dá pra tirar a cebola..." class="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue transition">${escapeHtml(p && p.notas_restaurante ? p.notas_restaurante : '')}</textarea>
          <p class="text-[11px] text-neutral-400 mt-1">Diferente de "ingredientes": isso é o que o Ari usa pra responder dúvidas do cliente sobre o prato (alergênicos, tempo de preparo, restrições etc.) — não aparece no cardápio.</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
          <input type="checkbox" id="pf-destaque" ${p && p.destaque ? 'checked' : ''} class="rounded border-neutral-300 text-brand-blue focus:ring-brand-blue" />
          Destacar no cardápio (máx. 3 por restaurante)
        </label>
        ${productFormError ? `<p class="text-brand-red text-sm flex items-center gap-1.5">⚠️ ${escapeHtml(productFormError)}</p>` : ''}
        <div class="flex gap-2 pt-2">
          <button type="submit" ${savingProduct ? 'disabled' : ''} class="flex-1 bg-brand-blue text-white font-semibold rounded-lg py-2 shadow-brand-blue hover:opacity-90 transition disabled:opacity-50">${savingProduct ? 'Salvando...' : 'Salvar'}</button>
          <button type="button" id="pf-cancel" class="flex-1 bg-neutral-100 rounded-lg py-2 hover:bg-neutral-200 transition">Cancelar</button>
        </div>
      </form>
    </div>
  `
}

function closeProductForm() {
  document.removeEventListener('keydown', onProductFormKeydown)
  const overlay = document.getElementById('product-form-overlay')
  if (overlay) overlay.remove()
  editingProduct = null
  imagePreviewUrl = null
}

function bindProductFormEvents() {
  const overlay = document.getElementById('product-form-overlay')
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeProductForm()
  })
  document.addEventListener('keydown', onProductFormKeydown)
  const form = document.getElementById('product-form')
  document.getElementById('pf-cancel').addEventListener('click', closeProductForm)
  document.getElementById('pf-image').addEventListener('change', handleImagePreview)
  document.getElementById('pf-notes').addEventListener('input', (e) => {
    const counter = document.getElementById('pf-notes-counter')
    if (counter) counter.textContent = `${e.target.value.length}/300`
  })
  form.addEventListener('submit', handleProductFormSubmit)

  // Alterna só a visibilidade do campo de upload (sem re-render do form
  // inteiro) para não perder o que o restaurante já digitou nos outros
  // campos ao trocar de ideia sobre ter foto ou não.
  form.querySelectorAll('input[name="pf-has-image"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      productHasImage = e.target.value === 'yes'
      document.getElementById('pf-image-section').classList.toggle('hidden', !productHasImage)
      form.querySelectorAll('[data-has-image-option]').forEach((label) => {
        const active = label.getAttribute('data-has-image-option') === (productHasImage ? 'yes' : 'no')
        label.classList.toggle('border-brand-blue', active)
        label.classList.toggle('bg-brand-blue/5', active)
        label.classList.toggle('text-brand-blue', active)
        label.classList.toggle('font-medium', active)
        label.classList.toggle('border-neutral-300', !active)
        label.classList.toggle('text-neutral-500', !active)
      })
    })
  })
}

function onProductFormKeydown(e) {
  if (e.key === 'Escape') closeProductForm()
}

function handleImagePreview(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const preview = document.getElementById('pf-image-preview')
    preview.classList.remove('img-placeholder', 'text-xl')
    preview.innerHTML = `<img src="${reader.result}" class="w-full h-full object-cover" />`
  }
  reader.readAsDataURL(file)
}

async function handleProductFormSubmit(e) {
  e.preventDefault()
  savingProduct = true
  productFormError = ''
  const submitBtn = document.querySelector('#product-form button[type="submit"]')
  submitBtn.disabled = true
  submitBtn.textContent = 'Salvando...'

  try {
    const name = document.getElementById('pf-name').value.trim()
    const description = document.getElementById('pf-description').value.trim()
    const price = Number(document.getElementById('pf-price').value)
    const ingredients = document
      .getElementById('pf-ingredients')
      .value.split(',')
      .map((i) => i.trim())
      .filter(Boolean)
    const category_id = document.getElementById('pf-category').value || null
    const notas_restaurante = document.getElementById('pf-notes').value.trim().slice(0, 300) || null
    const destaque = document.getElementById('pf-destaque').checked
    const hasImage = document.querySelector('input[name="pf-has-image"]:checked').value === 'yes'
    const imageFile = hasImage ? document.getElementById('pf-image').files[0] : null

    // Validação de UX antes de bater no banco — a validação de verdade é o
    // trigger enforce_max_destaque_products() (migration 0011), que barra
    // mesmo se essa checagem no frontend for burlada (ex: duas abas abertas).
    if (destaque) {
      const outrosDestaques = productsState.filter(
        (prod) => prod.destaque && (!editingProduct || prod.id !== editingProduct.id)
      ).length
      if (outrosDestaques >= 3) {
        throw new Error('Já existem 3 produtos em destaque. Remova um destaque antes de adicionar outro.')
      }
    }

    // "Não tem imagem" limpa qualquer foto anterior — sem foto_url, o
    // cardápio trata o produto como sem imagem (sem placeholder reservado).
    let image_url = hasImage ? (editingProduct ? editingProduct.image_url : null) : null

    if (imageFile) {
      // Path com prefixo do restaurant_id: as policies de storage.objects
      // (migration 0003) exigem que (storage.foldername(name))[1] seja o id
      // de um restaurante cujo access_token bate com o header enviado.
      const path = `${restaurant.id}/${crypto.randomUUID()}-${imageFile.name}`
      const { error: uploadError } = await restaurantClient.storage.from('products').upload(path, imageFile)
      if (uploadError) throw uploadError
      const { data: publicUrlData } = restaurantClient.storage.from('products').getPublicUrl(path)
      image_url = publicUrlData.publicUrl
    }

    const payload = {
      restaurant_id: restaurant.id,
      name,
      description: description || null,
      price,
      ingredients,
      category_id,
      image_url,
      notas_restaurante,
      destaque,
    }

    const isNew = !editingProduct
    const { error: saveError } = editingProduct
      ? await restaurantClient.from('products').update(payload).eq('id', editingProduct.id)
      : await restaurantClient.from('products').insert(payload)

    if (saveError) throw saveError

    closeProductForm()
    showToast(isNew ? 'Produto cadastrado!' : 'Produto atualizado!', 'success')
    loadProducts()
  } catch (err) {
    productFormError = errorMessage(err)
    savingProduct = false
    renderProductFormModal()
  }
}

init()
