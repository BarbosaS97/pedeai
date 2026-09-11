// painel.js — página restaurante/index.html?token=... (equivalente ao antigo /r/:accessToken)

const STATUS_META = {
  pending: { label: 'Pendente', bar: 'border-l-amber-400', badge: 'bg-amber-100 text-amber-700' },
  preparing: { label: 'Em preparo', bar: 'border-l-blue-400', badge: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Pronto', bar: 'border-l-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Concluído', bar: 'border-l-neutral-300', badge: 'bg-neutral-100 text-neutral-600' },
  cancelled: { label: 'Cancelado', bar: 'border-l-red-400', badge: 'bg-red-100 text-red-700' },
}

const root = document.getElementById('root')
const accessToken = new URLSearchParams(location.search).get('token')

let restaurantClient = null
let restaurant = null
let activeTab = 'orders'
let realtimeChannel = null

let ordersState = []
let productsState = []
let categoriesState = []
let newCategoryName = ''
let renamingCategoryId = null
let renamingCategoryDraft = ''
let editingProduct = null
let productFormError = ''
let savingProduct = false
let imagePreviewUrl = null

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

  renderPanel()
}

function renderPanel() {
  root.innerHTML = `
    <div class="min-h-screen bg-neutral-50">
      <header class="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-200 px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            ${renderLogo({ size: 'sm' })}
            <p class="text-sm text-neutral-500 mt-1">${escapeHtml(restaurant.name)}</p>
          </div>
          <div class="flex items-center gap-3">
            <a href="${escapeHtml(kitchenUrl(accessToken))}" target="_blank" rel="noreferrer" class="text-xs text-brand-purple underline hover:opacity-80 transition">👨‍🍳 Abrir cozinha ↗</a>
            <a href="${escapeHtml(menuUrl(restaurant.slug))}" target="_blank" rel="noreferrer" class="text-xs text-brand-purple underline hover:opacity-80 transition">Ver cardápio público ↗</a>
          </div>
        </div>
        <nav class="flex gap-2 mt-4">
          <button data-tab="orders" class="px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'orders' ? 'bg-brand-purple text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}">📋 Pedidos</button>
          <button data-tab="products" class="px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'products' ? 'bg-brand-purple text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}">🍽️ Produtos</button>
        </nav>
      </header>

      <main class="max-w-3xl mx-auto px-6 py-8" id="tab-content"></main>
    </div>
  `

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')))
  })

  renderTabContent()
}

function switchTab(tab) {
  if (tab === activeTab) return
  if (activeTab === 'orders') unsubscribeOrders()
  activeTab = tab
  renderPanel()
}

function renderTabContent() {
  const container = document.getElementById('tab-content')
  if (activeTab === 'orders') {
    container.innerHTML = ordersTabHtml()
    bindOrdersTabEvents()
    loadOrders()
    subscribeOrders()
  } else {
    container.innerHTML = productsTabHtml()
    bindProductsTabEvents()
    loadCategories()
    loadProducts()
  }
}

// ---- Pedidos ----

function ordersTabHtml() {
  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">Pedidos em tempo real</h2>
        <span class="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>ao vivo
        </span>
      </div>
      <div id="orders-list">${skeletonCardsHtml(2)}</div>
    </div>
  `
}

function renderOrdersList() {
  if (ordersState.length === 0) {
    return emptyStateHtml('🧾', 'Nenhum pedido ainda. Assim que um cliente pedir, aparece aqui na hora.')
  }
  return ordersState
    .map((order) => {
      const meta = STATUS_META[order.status] || STATUS_META.pending
      return `
    <div class="fade-slide-in bg-white border border-neutral-200 border-l-4 ${meta.bar} rounded-xl p-4 mb-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-medium">${order.table_number ? `Mesa ${escapeHtml(order.table_number)}` : 'Balcão'}</p>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}">${meta.label}</span>
          </div>
          ${
            order.customer_name
              ? `<p class="text-sm text-neutral-700 mt-0.5">👤 ${escapeHtml(order.customer_name)}${
                  order.customer_phone
                    ? ` · <a href="tel:${escapeHtml(order.customer_phone.replace(/\D/g, ''))}" class="text-brand-purple underline">${escapeHtml(order.customer_phone)}</a>`
                    : ''
                }</p>`
              : ''
          }
          <p class="text-sm text-neutral-600 mt-0.5">R$ ${formatBRL(order.total)}</p>
          <p class="text-xs text-neutral-400">${new Date(order.created_at).toLocaleString('pt-BR')}</p>
        </div>
        <select data-order-select="${order.id}" class="text-sm border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition">
          ${Object.entries(STATUS_META)
            .map(([value, m]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${m.label}</option>`)
            .join('')}
        </select>
      </div>
    </div>
  `
    })
    .join('')
}

function bindOrdersTabEvents() {
  document.getElementById('orders-list').addEventListener('change', (e) => {
    const orderId = e.target.getAttribute('data-order-select')
    if (orderId) updateOrderStatus(orderId, e.target.value)
  })
}

async function loadOrders() {
  const { data, error } = await restaurantClient
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('created_at', { ascending: false })
  if (error) showToast('Erro ao carregar pedidos.', 'error')
  ordersState = data || []
  const list = document.getElementById('orders-list')
  if (list) list.innerHTML = renderOrdersList()
}

async function updateOrderStatus(orderId, status) {
  const { error } = await restaurantClient.from('orders').update({ status }).eq('id', orderId)
  if (error) showToast('Erro ao atualizar status do pedido.', 'error')
}

function subscribeOrders() {
  // Realtime: novos pedidos aparecem na hora, sem recarregar a página.
  realtimeChannel = restaurantClient
    .channel(`orders-${restaurant.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
      () => loadOrders()
    )
    .subscribe()
}

function unsubscribeOrders() {
  if (realtimeChannel) {
    restaurantClient.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}

// ---- Aba de produtos (categorias + lista) ----

function productsTabHtml() {
  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">Produtos</h2>
        <button id="new-product-btn" class="bg-brand-orange text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90 active:scale-[0.99] transition">+ Novo produto</button>
      </div>
      <div id="categories-manager">${categoriesManagerHtml()}</div>
      <div id="products-list" class="space-y-5">${skeletonCardsHtml(2)}</div>
    </div>
  `
}

// ---- Categorias (seções do cardápio) ----

function categoriesManagerHtml() {
  return `
    <div class="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
      <p class="text-sm font-semibold text-neutral-700">Categorias (seções do cardápio)</p>
      <div class="flex flex-wrap gap-2">
        ${categoriesState.map(categoryChipHtml).join('')}
      </div>
      <form id="new-category-form" class="flex gap-2">
        <input
          id="new-category-input"
          value="${escapeHtml(newCategoryName)}"
          placeholder="Nova categoria (ex: Bebidas)"
          class="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple transition"
        />
        <button type="submit" class="bg-brand-purple text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition shrink-0">+ Adicionar</button>
      </form>
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
      <form data-rename-form="${c.id}" class="flex items-center gap-1 bg-neutral-100 rounded-full pl-3 pr-1 py-1">
        <input data-rename-input value="${escapeHtml(renamingCategoryDraft)}" class="bg-transparent text-sm w-28 focus:outline-none" />
        <button type="submit" title="Salvar" class="text-emerald-600 text-sm w-7 h-7 flex items-center justify-center hover:bg-emerald-50 rounded-full transition">✓</button>
        <button type="button" data-cancel-rename="${c.id}" title="Cancelar" class="text-neutral-400 text-sm w-7 h-7 flex items-center justify-center hover:bg-neutral-200 rounded-full transition">✕</button>
      </form>
    `
  }
  return `
    <span class="inline-flex items-center gap-0.5 bg-neutral-100 text-neutral-700 text-sm rounded-full pl-3 pr-1 py-1">
      ${escapeHtml(c.name)}
      <button data-edit-category="${c.id}" title="Renomear" class="text-neutral-400 hover:text-brand-purple w-7 h-7 flex items-center justify-center rounded-full transition">✎</button>
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

function productImageHtml(p) {
  if (p.image_url) {
    return `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-16 h-16 rounded-lg object-cover shrink-0" />`
  }
  return `<div class="img-placeholder w-16 h-16 rounded-lg shrink-0 text-2xl">🍽️</div>`
}

function productRowHtml(p) {
  return `
    <div class="fade-slide-in card-hover bg-white border border-neutral-200 rounded-xl p-4 flex gap-4 ${p.is_available ? '' : 'opacity-60'}">
      ${productImageHtml(p)}
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">
          ${escapeHtml(p.name)}
          ${!p.is_available ? '<span class="text-xs text-neutral-400 font-normal">(indisponível)</span>' : ''}
        </p>
        <p class="text-sm text-neutral-500 line-clamp-2">${escapeHtml(p.description || '')}</p>
        <p class="text-sm font-semibold text-brand-orange mt-1">R$ ${formatBRL(p.price)}</p>
      </div>
      <div class="flex flex-col gap-1 shrink-0">
        <button data-action="edit" data-id="${p.id}" class="text-xs bg-neutral-100 rounded-lg px-3 py-1 hover:bg-neutral-200 transition">Editar</button>
        <button data-action="toggle" data-id="${p.id}" class="text-xs bg-neutral-100 rounded-lg px-3 py-1 hover:bg-neutral-200 transition">${p.is_available ? 'Ocultar' : 'Exibir'}</button>
        <button data-action="delete" data-id="${p.id}" class="text-xs bg-brand-red/10 text-brand-red rounded-lg px-3 py-1 hover:bg-brand-red/20 transition">Excluir</button>
      </div>
    </div>
  `
}

// Agrupa produtos pela categoria (mesma lógica usada no cardápio público, ver
// cliente/cardapio.js) — serve de prévia pro restaurante de como vai ficar.
function buildProductGroups() {
  if (categoriesState.length === 0) return null
  const groups = categoriesState.map((c) => ({
    id: c.id,
    name: c.name,
    items: productsState.filter((p) => p.category_id === c.id),
  }))
  const uncategorized = productsState.filter(
    (p) => !p.category_id || !categoriesState.some((c) => c.id === p.category_id)
  )
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Outros', items: uncategorized })
  return groups.filter((g) => g.items.length > 0)
}

function renderProductsList() {
  if (productsState.length === 0) {
    return emptyStateHtml('🍽️', 'Nenhum produto cadastrado ainda. Clique em "+ Novo produto" para começar.')
  }

  const groups = buildProductGroups()
  if (!groups) {
    return `<div class="space-y-3">${productsState.map(productRowHtml).join('')}</div>`
  }

  return groups
    .map(
      (g) => `
        <div class="space-y-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-neutral-400">${escapeHtml(g.name)} <span class="text-neutral-300 normal-case">(${g.items.length})</span></p>
          ${g.items.map(productRowHtml).join('')}
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
  const confirmed = await showConfirm({
    title: 'Excluir produto',
    message: `Remover "${p.name}" do cardápio? Essa ação não pode ser desfeita.`,
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
        <input required id="pf-name" value="${escapeHtml(p ? p.name : '')}" placeholder="Nome do produto" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple transition" />
        <textarea id="pf-description" placeholder="Descrição" rows="2" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple transition">${escapeHtml(p ? p.description || '' : '')}</textarea>
        <input required type="number" step="0.01" min="0" id="pf-price" value="${p ? p.price : ''}" placeholder="Preço (R$)" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple transition" />
        <input id="pf-ingredients" value="${escapeHtml(p && p.ingredients ? p.ingredients.join(', ') : '')}" placeholder="Ingredientes (separados por vírgula)" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple transition" />
        <select id="pf-category" class="w-full border border-neutral-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple transition">
          <option value="">Sem categoria (aparece em "Outros")</option>
          ${categoriesState
            .map(
              (c) => `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
            )
            .join('')}
        </select>
        <div class="flex items-center gap-3">
          <div id="pf-image-preview" class="w-14 h-14 rounded-lg shrink-0 overflow-hidden ${imagePreviewUrl ? '' : 'img-placeholder text-xl'}">
            ${imagePreviewUrl ? `<img src="${escapeHtml(imagePreviewUrl)}" class="w-full h-full object-cover" />` : '🍽️'}
          </div>
          <input type="file" accept="image/*" id="pf-image" class="flex-1 text-xs" />
        </div>
        ${productFormError ? `<p class="text-brand-red text-sm flex items-center gap-1.5">⚠️ ${escapeHtml(productFormError)}</p>` : ''}
        <div class="flex gap-2 pt-2">
          <button type="submit" ${savingProduct ? 'disabled' : ''} class="flex-1 bg-brand-purple text-white font-semibold rounded-lg py-2 hover:opacity-90 transition disabled:opacity-50">${savingProduct ? 'Salvando...' : 'Salvar'}</button>
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
  form.addEventListener('submit', handleProductFormSubmit)
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
    const imageFile = document.getElementById('pf-image').files[0]

    let image_url = editingProduct ? editingProduct.image_url : null

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
