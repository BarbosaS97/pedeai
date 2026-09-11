// cardapio.js — página cliente/index.html?slug=...&mesa=... (equivalente ao antigo /:slug e /:slug/mesa/:numero)
//
// Página pensada mobile-first: é aberta quase sempre a partir do QR Code da
// mesa, direto no navegador do celular do cliente.

const root = document.getElementById('root')
const queryParams = new URLSearchParams(location.search)
const slug = queryParams.get('slug')
const numero = queryParams.get('mesa')

const CUSTOMER_STORAGE_KEY = 'pedeai_customer'

let restaurant = null
let products = []
let categories = []
let cart = [] // { product, quantity, notes }
let cartOpen = false
let placing = false
let chatOpen = false
let chatMessages = []
let chatInput = ''
let chatLoading = false
let expandedProduct = null
let productNoteDraft = ''

// Identificação do cliente (nome + telefone), pedida uma vez na tela de
// boas-vindas antes do cardápio. Guardada no navegador (localStorage) pra não
// precisar perguntar de novo numa próxima visita no mesmo aparelho.
let showWelcome = true
let customerName = ''
let customerPhone = ''
let welcomeNameDraft = ''
let welcomePhoneDraft = ''

// O garçom IA responde em texto simples por instrução do prompt (ver
// ai-waiter/index.ts), mas modelos de linguagem às vezes escapam essa regra e
// devolvem markdown (**negrito**, `código`, # título). Como o chat só exibe
// texto puro, tiramos essas marcações aqui como segurança extra.
function stripMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
}

// ---- Identidade do cliente (nome + telefone) ----

function loadStoredCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.name === 'string' && typeof parsed.phone === 'string') return parsed
  } catch {
    // localStorage indisponível (modo privado, storage bloqueado etc.) — cai
    // no fluxo normal de pedir os dados de novo, sem quebrar a página.
  }
  return null
}

function saveCustomer(name, phone) {
  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({ name, phone }))
  } catch {
    // Sem storage disponível: segue o pedido normalmente, só não vai lembrar
    // na próxima visita.
  }
}

function maskPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function isValidName(name) {
  return name.trim().length >= 2
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11
}

function isWelcomeValid() {
  return isValidName(welcomeNameDraft) && isValidPhone(welcomePhoneDraft)
}

function buildInitialChatMessage() {
  const greeting = customerName ? `, ${customerName}` : ''
  return `Pede aí${greeting}! Eu sou o garçom IA do ${restaurant.name}. O que você tá com vontade de comer hoje?`
}

async function init() {
  if (!slug) {
    root.innerHTML = notFoundHtml('Restaurante não encontrado.')
    return
  }

  root.innerHTML = loadingHtml()

  const { data } = await supabaseClient
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  restaurant = data || 'not_found'

  if (restaurant === 'not_found') {
    root.innerHTML = notFoundHtml('Restaurante não encontrado.')
    return
  }

  const { data: prods } = await supabaseClient
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('is_available', true)
    .order('name')
  products = prods || []

  // Categorias (seções do cardápio) criadas pelo restaurante — ver
  // restaurante/painel.js. Se não houver nenhuma, o cardápio cai numa lista
  // simples, sem cabeçalhos de seção.
  const { data: cats } = await supabaseClient
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  categories = cats || []

  const stored = loadStoredCustomer()
  if (stored) {
    customerName = stored.name
    customerPhone = stored.phone
    showWelcome = false
    chatMessages = [{ role: 'assistant', content: buildInitialChatMessage() }]
  }

  renderPage()
}

function renderPage() {
  if (showWelcome) {
    root.innerHTML = welcomeScreenHtml()
    bindWelcomeEvents()
    document.body.style.overflow = ''
    return
  }

  root.innerHTML = pageHtml()
  bindPageEvents()
  // Trava o scroll do fundo da página enquanto algum bottom sheet (chat,
  // carrinho ou detalhe do produto) está aberto — sem isso, no celular dá pra
  // arrastar a página por trás do modal.
  document.body.style.overflow = chatOpen || expandedProduct || cartOpen ? 'hidden' : ''
  if (chatOpen) scrollChatToBottom()
}

// ---- Tela de boas-vindas ----

function welcomeScreenHtml() {
  return `
    <div class="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-brand-purple/10 via-neutral-50 to-brand-orange/10 px-6 py-10">
      <div class="w-full max-w-sm space-y-6 fade-slide-in">
        <div class="flex justify-center">${renderLogo({ size: 'lg', showSlogan: true })}</div>
        <p class="text-center text-sm text-neutral-600 leading-relaxed">
          Escolha seus pratos, converse com nosso garçom de IA e faça seu pedido direto pelo celular.
        </p>
        <form id="welcome-form" class="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div>
            <label for="welcome-name" class="text-xs font-semibold text-neutral-500 mb-1 block">Primeiro nome</label>
            <input
              id="welcome-name"
              value="${escapeHtml(welcomeNameDraft)}"
              placeholder="Ex: Ana"
              autocomplete="given-name"
              autofocus
              class="w-full border border-neutral-300 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-purple transition"
            />
          </div>
          <div>
            <label for="welcome-phone" class="text-xs font-semibold text-neutral-500 mb-1 block">Telefone com DDD</label>
            <input
              id="welcome-phone"
              value="${escapeHtml(welcomePhoneDraft)}"
              placeholder="(11) 91234-5678"
              inputmode="numeric"
              autocomplete="tel"
              class="w-full border border-neutral-300 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-purple transition"
            />
          </div>
          <button
            type="submit"
            id="welcome-submit"
            ${isWelcomeValid() ? '' : 'disabled'}
            class="w-full bg-brand-purple text-white font-semibold rounded-lg py-3 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-40"
          >
            Iniciar
          </button>
        </form>
      </div>
    </div>
  `
}

function bindWelcomeEvents() {
  document.getElementById('welcome-name').addEventListener('input', (e) => {
    welcomeNameDraft = e.target.value
    updateWelcomeSubmitState()
  })

  document.getElementById('welcome-phone').addEventListener('input', (e) => {
    const masked = maskPhone(e.target.value)
    welcomePhoneDraft = masked
    e.target.value = masked
    updateWelcomeSubmitState()
  })

  document.getElementById('welcome-form').addEventListener('submit', (e) => {
    e.preventDefault()
    if (!isWelcomeValid()) return
    customerName = welcomeNameDraft.trim()
    customerPhone = welcomePhoneDraft
    saveCustomer(customerName, customerPhone)
    chatMessages = [{ role: 'assistant', content: buildInitialChatMessage() }]
    showWelcome = false
    renderPage()
  })
}

function updateWelcomeSubmitState() {
  const btn = document.getElementById('welcome-submit')
  if (btn) btn.disabled = !isWelcomeValid()
}

// ---- Cardápio ----

function pageHtml() {
  return `
    <div class="min-h-[100dvh] bg-neutral-50 pb-32">
      <header class="bg-gradient-to-r from-brand-orange to-brand-red text-white px-4 py-5 sm:px-6 sm:py-6 shadow-sm">
        ${renderLogo({ size: 'sm' })}
        <h1 class="text-xl sm:text-2xl font-bold mt-2 break-words">${escapeHtml(restaurant.name)}</h1>
        ${numero ? `<p class="text-sm text-white/80 flex items-center gap-1 mt-0.5"><span>🪑</span>Mesa ${escapeHtml(numero)}</p>` : ''}
      </header>

      <main class="max-w-2xl mx-auto px-4 py-5 sm:px-6 sm:py-6 space-y-6">
        ${menuContentHtml()}
      </main>

      <!-- Botão flutuante do garçom IA — coração da proposta "Pede AI" -->
      <button
        id="chat-fab"
        class="fixed right-4 bg-brand-purple text-white rounded-full shadow-lg hover:shadow-xl px-5 py-3.5 font-semibold text-sm transition active:scale-95 ${
          chatOpen || expandedProduct || cartOpen ? 'hidden' : ''
        }"
        style="bottom: calc(6.5rem + env(safe-area-inset-bottom, 0px));"
      >
        💬 Garçom IA
      </button>

      ${cart.length > 0 ? cartBarHtml() : ''}
      ${expandedProduct ? productDetailModalHtml() : ''}
      ${cartOpen ? cartSheetHtml() : ''}
      ${chatOpen ? chatModalHtml() : ''}
    </div>
  `
}

// Agrupa os produtos disponíveis pelas categorias do restaurante (mesma regra
// usada na prévia do painel, ver restaurante/painel.js). Sem categorias
// cadastradas, retorna null — o chamador cai numa lista simples sem seções.
// Produto sem categoria (ou cuja categoria foi excluída) entra em "Outros".
function buildMenuGroups() {
  if (categories.length === 0) return null
  const groups = categories
    .map((c) => ({ id: c.id, name: c.name, items: products.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.items.length > 0)
  const uncategorized = products.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id))
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Outros', items: uncategorized })
  return groups
}

function menuContentHtml() {
  if (products.length === 0) {
    return emptyStateHtml('🍽️', 'Cardápio ainda não tem itens disponíveis. Volte daqui a pouco!')
  }

  const groups = buildMenuGroups()
  if (!groups) {
    return `<div class="space-y-3">${products.map((p) => productCardHtml(p)).join('')}</div>`
  }

  return `${categoryNavHtml(groups)}${groups.map(menuSectionHtml).join('')}`
}

// Barra de "pílulas" pra pular direto pra uma seção — só compensa mostrar
// quando há mais de uma seção; com uma só, seria repetir o título à toa.
function categoryNavHtml(groups) {
  if (groups.length <= 1) return ''
  return `
    <nav class="scroll-contain sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-neutral-50/95 backdrop-blur border-b border-neutral-200 overflow-x-auto">
      <div class="flex gap-2 w-max">
        ${groups
          .map(
            (g) =>
              `<a href="#secao-${g.id || 'outros'}" class="text-xs font-semibold whitespace-nowrap bg-white border border-neutral-200 text-neutral-600 rounded-full px-3.5 py-2 hover:border-brand-purple hover:text-brand-purple transition">${escapeHtml(g.name)}</a>`
          )
          .join('')}
      </div>
    </nav>
  `
}

function menuSectionHtml(g) {
  return `
    <section id="secao-${g.id || 'outros'}" class="space-y-3 scroll-mt-16">
      <h2 class="text-sm font-bold uppercase tracking-wide text-neutral-500">${escapeHtml(g.name)}</h2>
      <div class="space-y-3">${g.items.map((p) => productCardHtml(p)).join('')}</div>
    </section>
  `
}

function productImageHtml(p, size) {
  const boxClass = size === 'sm' ? 'w-14 h-14' : 'w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20'
  const iconClass = size === 'sm' ? 'text-xl' : 'text-2xl sm:text-3xl'
  if (p.image_url) {
    return `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="${boxClass} rounded-lg object-cover shrink-0" />`
  }
  return `<div class="img-placeholder ${boxClass} rounded-lg shrink-0 ${iconClass}">🍽️</div>`
}

function productCardHtml(p) {
  return `
    <div data-expand="${p.id}" class="fade-slide-in card-hover bg-white border border-neutral-200 rounded-xl p-3.5 sm:p-4 flex gap-3 sm:gap-4 cursor-pointer active:bg-neutral-50 transition">
      ${productImageHtml(p)}
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <p class="font-semibold leading-snug">${escapeHtml(p.name)}</p>
          <span class="text-neutral-300 shrink-0 mt-0.5" aria-hidden="true">›</span>
        </div>
        ${p.description ? `<p class="text-sm text-neutral-500 line-clamp-2 mt-0.5">${escapeHtml(p.description)}</p>` : ''}
        <div class="flex items-center justify-between mt-2 gap-2">
          <span class="font-semibold text-brand-orange">R$ ${formatBRL(p.price)}</span>
          <button data-add="${p.id}" class="text-sm bg-brand-purple text-white rounded-lg px-3.5 py-2 hover:opacity-90 active:scale-95 transition shrink-0">Adicionar</button>
        </div>
      </div>
    </div>
  `
}

// Modal de detalhe do produto — abre ao tocar no card (fora do botão
// "Adicionar"). Mostra descrição completa, ingredientes e o campo de
// observação (item já no carrinho? mostra a observação salva, pronta pra
// editar).
function productDetailModalHtml() {
  const p = expandedProduct
  const cartItem = cart.find((i) => i.product.id === p.id)
  return `
    <div id="detail-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div id="detail-box" class="modal-box bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto scroll-contain safe-bottom">
        <div class="relative">
          ${
            p.image_url
              ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-full h-44 sm:h-52 object-cover" />`
              : `<div class="img-placeholder w-full h-36 text-5xl">🍽️</div>`
          }
          <button id="detail-close" title="Fechar" class="absolute top-3 right-3 bg-white/95 hover:bg-white text-neutral-600 rounded-full w-9 h-9 flex items-center justify-center shadow transition">✕</button>
        </div>
        <div class="p-5 space-y-3">
          <div>
            <h3 class="text-lg font-bold leading-snug">${escapeHtml(p.name)}</h3>
            <p class="text-brand-orange font-semibold mt-0.5">R$ ${formatBRL(p.price)}</p>
          </div>
          ${p.description ? `<p class="text-sm text-neutral-600 leading-relaxed">${escapeHtml(p.description)}</p>` : ''}
          ${
            p.ingredients && p.ingredients.length > 0
              ? `
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">Ingredientes</p>
              <div class="flex flex-wrap gap-1.5">
                ${p.ingredients.map((i) => `<span class="text-xs bg-neutral-100 text-neutral-600 rounded-full px-2.5 py-1">${escapeHtml(i)}</span>`).join('')}
              </div>
            </div>
          `
              : ''
          }
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="pf-note" class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Observações</label>
              <span id="note-counter" class="text-xs text-neutral-400">${productNoteDraft.length}/140</span>
            </div>
            <textarea
              id="pf-note"
              rows="2"
              maxlength="140"
              placeholder="Ex: sem cebola, ponto da carne, tirar o queijo…"
              class="w-full border border-neutral-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-purple transition resize-none"
            >${escapeHtml(productNoteDraft)}</textarea>
          </div>
          <button id="detail-save-btn" class="w-full bg-brand-purple text-white font-semibold rounded-lg py-3 hover:opacity-90 active:scale-[0.99] transition mt-1">
            ${cartItem ? 'Salvar observação' : 'Adicionar ao pedido'}
          </button>
        </div>
      </div>
    </div>
  `
}

// ---- Carrinho ----

function cartBarHtml() {
  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const count = cart.reduce((sum, i) => sum + i.quantity, 0)
  return `
    <button
      id="cart-bar-open"
      class="fixed bottom-0 left-0 right-0 bg-brand-purple text-white shadow-[0_-4px_16px_rgba(0,0,0,0.15)] safe-bottom transition active:opacity-90 ${
        chatOpen || expandedProduct ? 'hidden' : ''
      }"
    >
      <div class="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
        <span class="flex items-center gap-2 font-semibold text-sm">
          <span class="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">${count}</span>
          Ver carrinho
        </span>
        <span class="font-bold">R$ ${formatBRL(total)}</span>
      </div>
    </button>
  `
}

function cartItemRowHtml(i) {
  const lineTotal = i.product.price * i.quantity
  return `
    <div class="fade-slide-in flex gap-3 pb-3 border-b border-neutral-100 last:border-b-0 last:pb-0">
      ${productImageHtml(i.product, 'sm')}
      <div class="flex-1 min-w-0">
        <div data-edit-item="${i.product.id}" class="cursor-pointer">
          <div class="flex items-start justify-between gap-2">
            <p class="font-medium text-sm leading-snug">${escapeHtml(i.product.name)}</p>
            <button data-remove="${i.product.id}" title="Remover item" class="text-neutral-300 hover:text-brand-red transition shrink-0 w-7 h-7 -mt-1 -mr-1 flex items-center justify-center">🗑</button>
          </div>
          <p class="text-xs text-neutral-400">R$ ${formatBRL(i.product.price)} cada</p>
          ${i.notes ? `<p class="text-xs text-neutral-500 italic mt-0.5">"${escapeHtml(i.notes)}"</p>` : ''}
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex items-center gap-2">
            <button data-dec="${i.product.id}" class="qty-btn w-8 h-8 text-base bg-neutral-100 hover:bg-neutral-200 rounded-lg">−</button>
            <span class="w-5 text-center text-sm tabular-nums">${i.quantity}</span>
            <button data-inc="${i.product.id}" class="qty-btn w-8 h-8 text-base bg-neutral-100 hover:bg-neutral-200 rounded-lg">+</button>
          </div>
          <span class="font-semibold text-sm text-brand-orange">R$ ${formatBRL(lineTotal)}</span>
        </div>
      </div>
    </div>
  `
}

function cartSheetHtml() {
  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  return `
    <div id="cart-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div id="cart-box" class="modal-box bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85dvh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <span class="font-semibold">🛒 Seu carrinho</span>
          <button id="cart-close" title="Fechar" class="text-neutral-400 hover:text-neutral-600 transition text-xl leading-none w-9 h-9 flex items-center justify-center -mr-2">✕</button>
        </div>
        <div class="scroll-contain flex-1 overflow-y-auto px-4 py-3">
          ${
            cart.length === 0
              ? emptyStateHtml('🛒', 'Seu carrinho está vazio. Toque nos pratos para adicionar.')
              : cart.map(cartItemRowHtml).join('')
          }
        </div>
        ${
          cart.length > 0
            ? `
          <div class="safe-bottom border-t border-neutral-100 p-4 space-y-3 shrink-0">
            <div class="flex items-center justify-between">
              <span class="text-sm text-neutral-500">Subtotal</span>
              <span class="font-bold text-lg">R$ ${formatBRL(total)}</span>
            </div>
            <button id="place-order-btn" ${placing ? 'disabled' : ''} class="w-full bg-brand-red text-white font-semibold rounded-lg py-3 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50">
              ${placing ? 'Enviando...' : 'Finalizar pedido'}
            </button>
          </div>
        `
            : ''
        }
      </div>
    </div>
  `
}

function chatModalHtml() {
  return `
    <div id="chat-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div id="chat-box" class="modal-box bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md h-[85dvh] sm:h-[32rem] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <span class="font-semibold">💬 Garçom IA</span>
          <button id="chat-close" class="text-neutral-400 hover:text-neutral-600 transition text-xl leading-none w-9 h-9 flex items-center justify-center -mr-2">✕</button>
        </div>
        <div id="chat-messages" class="scroll-contain flex-1 overflow-y-auto px-4 py-3 space-y-3">
          ${chatMessages
            .map(
              (m) => `
            <div class="flex fade-slide-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-800'}">${escapeHtml(m.content)}</div>
            </div>
          `
            )
            .join('')}
          ${
            chatLoading
              ? `<div class="flex justify-start"><div class="bg-neutral-100 text-neutral-500 rounded-2xl px-4 py-2.5"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>`
              : ''
          }
        </div>
        ${
          products.length > 0
            ? `
          <div class="scroll-contain shrink-0 px-3 py-2 flex gap-2 overflow-x-auto border-t border-neutral-100">
            ${products
              .slice(0, 5)
              .map((p) => `<button data-add="${p.id}" class="text-xs bg-brand-orange/10 text-brand-orange whitespace-nowrap rounded-lg px-3 py-2 hover:bg-brand-orange/20 transition shrink-0">+ ${escapeHtml(p.name)}</button>`)
              .join('')}
          </div>
        `
            : ''
        }
        <form id="chat-form" class="safe-bottom flex gap-2 p-3 border-t border-neutral-100 shrink-0">
          <input id="chat-input" value="${escapeHtml(chatInput)}" placeholder="Ex: algo vegetariano e picante" autocomplete="off" class="flex-1 min-w-0 border border-neutral-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-purple transition" />
          <button type="submit" ${chatLoading ? 'disabled' : ''} class="bg-brand-purple text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50 shrink-0">Enviar</button>
        </form>
      </div>
    </div>
  `
}

function bindPageEvents() {
  document.getElementById('chat-fab').addEventListener('click', () => {
    chatOpen = true
    renderPage()
  })

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.getAttribute('data-add')))
  })

  document.querySelectorAll('[data-expand]').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Clique no botão "Adicionar" (que fica dentro do card) não deve abrir
      // o detalhe — só o resto do card.
      if (e.target.closest('[data-add]')) return
      openProductDetail(card.getAttribute('data-expand'))
    })
  })

  const detailOverlay = document.getElementById('detail-overlay')
  if (detailOverlay) {
    detailOverlay.addEventListener('click', (e) => {
      if (e.target === detailOverlay) closeProductDetail()
    })
    document.getElementById('detail-close').addEventListener('click', closeProductDetail)
    document.getElementById('pf-note').addEventListener('input', (e) => {
      productNoteDraft = e.target.value
      const counter = document.getElementById('note-counter')
      if (counter) counter.textContent = `${e.target.value.length}/140`
    })
    document.getElementById('detail-save-btn').addEventListener('click', () => saveProductFromDetail(expandedProduct.id))
  }

  const cartBarOpen = document.getElementById('cart-bar-open')
  if (cartBarOpen) {
    cartBarOpen.addEventListener('click', () => {
      cartOpen = true
      renderPage()
    })
  }

  const cartOverlay = document.getElementById('cart-overlay')
  if (cartOverlay) {
    cartOverlay.addEventListener('click', (e) => {
      if (e.target === cartOverlay) closeCartSheet()
    })
    document.getElementById('cart-close').addEventListener('click', closeCartSheet)

    document.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => removeFromCart(btn.getAttribute('data-remove')))
    })
    document.querySelectorAll('[data-edit-item]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove]')) return
        cartOpen = false
        openProductDetail(el.getAttribute('data-edit-item'))
      })
    })
  }

  document.querySelectorAll('[data-inc]').forEach((btn) =>
    btn.addEventListener('click', () => updateQuantity(btn.getAttribute('data-inc'), 1))
  )
  document.querySelectorAll('[data-dec]').forEach((btn) =>
    btn.addEventListener('click', () => updateQuantity(btn.getAttribute('data-dec'), -1))
  )

  const placeBtn = document.getElementById('place-order-btn')
  if (placeBtn) placeBtn.addEventListener('click', placeOrder)

  const chatOverlay = document.getElementById('chat-overlay')
  if (chatOverlay) {
    chatOverlay.addEventListener('click', (e) => {
      if (e.target === chatOverlay) {
        chatOpen = false
        renderPage()
      }
    })
    document.getElementById('chat-close').addEventListener('click', () => {
      chatOpen = false
      renderPage()
    })
    document.getElementById('chat-input').addEventListener('input', (e) => {
      chatInput = e.target.value
    })
    document.getElementById('chat-form').addEventListener('submit', sendChatMessage)
    // Sem autofocus agressivo no celular: abrir o teclado sozinho ao abrir o
    // chat é intrusivo. O cliente toca no campo quando quiser digitar.
  }
}

function openProductDetail(productId) {
  const product = products.find((p) => p.id === productId)
  if (!product) return
  expandedProduct = product
  const cartItem = cart.find((i) => i.product.id === productId)
  productNoteDraft = cartItem ? cartItem.notes || '' : ''
  renderPage()
}

function closeProductDetail() {
  expandedProduct = null
  productNoteDraft = ''
  renderPage()
}

function closeCartSheet() {
  cartOpen = false
  renderPage()
}

// Adiciona um item novo (quantidade 1) ou, se o produto já estiver no
// carrinho, só atualiza a observação — a quantidade se mexe pelos botões +/−
// dentro do carrinho, não por aqui.
function saveProductFromDetail(productId) {
  const product = products.find((p) => p.id === productId)
  if (!product) return
  const note = productNoteDraft.trim().slice(0, 140)
  const existing = cart.find((i) => i.product.id === productId)
  if (existing) {
    existing.notes = note
  } else {
    cart.push({ product, quantity: 1, notes: note })
  }
  expandedProduct = null
  productNoteDraft = ''
  renderPage()
}

function addToCart(productId) {
  const product = products.find((p) => p.id === productId)
  if (!product) return
  const existing = cart.find((i) => i.product.id === productId)
  if (existing) existing.quantity += 1
  else cart.push({ product, quantity: 1, notes: '' })
  renderPage()
}

function updateQuantity(productId, delta) {
  cart = cart
    .map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i))
    .filter((i) => i.quantity > 0)
  renderPage()
}

function removeFromCart(productId) {
  cart = cart.filter((i) => i.product.id !== productId)
  renderPage()
}

async function placeOrder() {
  placing = true
  renderPage()
  try {
    const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

    // Gera o id do pedido no navegador em vez de pedir pro Postgres devolver
    // a linha inserida (.select()) — o cliente anônimo não tem o token do
    // restaurante, então a policy de leitura de "orders" (só por token) nega
    // o RETURNING mesmo quando o insert em si é permitido, e o Postgres trata
    // isso como falha de RLS. Sem pedir a linha de volta, esse problema não
    // existe: já sabemos o id porque fomos nós que o geramos.
    const orderId = crypto.randomUUID()
    const { error: orderError } = await supabaseClient.from('orders').insert({
      id: orderId,
      restaurant_id: restaurant.id,
      table_number: numero ? Number(numero) : null,
      total,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
    })
    if (orderError) throw orderError

    const items = cart.map((i) => ({
      order_id: orderId,
      product_id: i.product.id,
      product_name: i.product.name,
      quantity: i.quantity,
      unit_price: i.product.price,
      notes: i.notes || null,
    }))
    const { error: itemsError } = await supabaseClient.from('order_items').insert(items)
    if (itemsError) throw itemsError

    placing = false
    cart = []
    cartOpen = false
    renderPage()
    showToast('Pedido enviado com sucesso!', 'success')
  } catch (err) {
    placing = false
    renderPage()
    showToast('Erro ao enviar pedido: ' + errorMessage(err), 'error', 5000)
  }
}

async function sendChatMessage(e) {
  e.preventDefault()
  const mensagem = chatInput.trim()
  if (!mensagem) return

  const historico = chatMessages.slice()
  chatMessages.push({ role: 'user', content: mensagem })
  chatInput = ''
  chatLoading = true
  renderPage()
  // Mantém o foco no campo depois de reenviar (o DOM foi todo recriado),
  // pra dar pra digitar a próxima mensagem sem tocar de novo no campo.
  const input = document.getElementById('chat-input')
  if (input) input.focus()

  try {
    const anonKey = window.PEDEAI_CONFIG.SUPABASE_ANON_KEY
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/ai-waiter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      // nome_cliente vai no corpo pro dia em que o prompt da Edge Function
      // (supabase/functions/ai-waiter/index.ts) passar a usá-lo pra
      // personalizar as respostas — hoje ele é só ignorado no backend. A
      // saudação inicial (buildInitialChatMessage) já usa o nome agora.
      body: JSON.stringify({ restaurante_slug: restaurant.slug, mensagem, historico, nome_cliente: customerName || undefined }),
    })
    const data = await res.json()
    chatMessages.push({
      role: 'assistant',
      content: stripMarkdown(data.resposta) || 'Desculpa, não consegui responder agora.',
    })
  } catch {
    chatMessages.push({ role: 'assistant', content: 'Ops, tive um problema para responder. Tenta de novo?' })
  } finally {
    chatLoading = false
    renderPage()
    // Idem: renderPage() recria o input do zero, então o foco (que já estava
    // lá, o usuário acabou de mandar uma mensagem) se perde de novo — restaura
    // pra dar pra continuar digitando sem tocar de novo no campo.
    const inputAfterReply = document.getElementById('chat-input')
    if (inputAfterReply) inputAfterReply.focus()
  }
}

function scrollChatToBottom() {
  const el = document.getElementById('chat-messages')
  if (el) el.scrollTop = el.scrollHeight
}

init()
