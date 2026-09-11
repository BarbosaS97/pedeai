// cardapio.js — página cliente/index.html?slug=...&mesa=... (equivalente ao antigo /:slug e /:slug/mesa/:numero)
//
// Página pensada mobile-first: é aberta quase sempre a partir do QR Code da
// mesa, direto no navegador do celular do cliente.

const root = document.getElementById('root')
const queryParams = new URLSearchParams(location.search)
const slug = queryParams.get('slug')
const numero = queryParams.get('mesa')

const CUSTOMER_STORAGE_KEY = 'pedeai_customer'
const CHAT_AVATAR_URL = '../images/avatar-chat.png'

function chatAvatarHtml(sizeClass) {
  return `<img src="${CHAT_AVATAR_URL}" alt="Ari" loading="eager" class="${sizeClass} rounded-full object-cover shrink-0 bg-brand-purple/20" />`
}

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

// Garçom IA agindo no carrinho (ver sendChatMessage/applyAiActions): teto de
// quantidade por ação — espelha o mesmo limite validado no servidor
// (ai-waiter/index.ts), como segunda camada de defesa.
const MAX_ITEM_QUANTITY = 20
let cartJustUpdated = false // dispara o pulso do botão/contador do carrinho por um render
let recentlyChangedProductIds = new Set() // destaca a linha na próxima vez que o carrinho abrir
let notingOrder = false // trava o campo do chat por um instante enquanto os cartões de ação entram
let staggerTimeoutId = null
// Quantas mensagens do chat já foram exibidas ao menos uma vez. O chat é
// redesenhado do zero a cada mudança de estado (padrão do app inteiro), e sem
// isso TODA mensagem antiga replay a animação de entrada a cada re-render —
// é o que causava o efeito de "adicionou duas vezes"/piscada ao usar o chat.
let chatRenderedCount = 0

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
  return `Pede aí${greeting}! Eu sou o Ari, garçom do ${restaurant.name}. O que você tá com vontade de comer hoje?`
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

      <!-- Botão flutuante do Ari — coração da proposta "Pede AI" -->
      <button
        id="chat-fab"
        class="fixed right-4 bg-brand-purple text-white rounded-full shadow-lg hover:shadow-xl pl-2 pr-4 py-2 font-semibold text-sm transition active:scale-95 flex items-center gap-2 ${
          chatOpen || expandedProduct || cartOpen ? 'hidden' : ''
        }"
        style="bottom: calc(6.5rem + env(safe-area-inset-bottom, 0px));"
      >
        ${chatAvatarHtml('w-8 h-8 ring-2 ring-white/40')}
        <span>Falar com o Ari</span>
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
      } ${cartJustUpdated ? 'cart-pulse' : ''}"
    >
      <div class="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
        <span class="flex items-center gap-2 font-semibold text-sm">
          <span class="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 ${cartJustUpdated ? 'badge-bump' : ''}">${count}</span>
          Ver carrinho
        </span>
        <span class="font-bold">R$ ${formatBRL(total)}</span>
      </div>
    </button>
  `
}

function cartItemRowHtml(i) {
  const lineTotal = i.product.price * i.quantity
  const highlight = recentlyChangedProductIds.has(i.product.id) ? 'row-highlight' : ''
  return `
    <div class="fade-slide-in flex gap-3 pb-3 border-b border-neutral-100 last:border-b-0 last:pb-0 rounded-lg px-1 -mx-1 ${highlight}">
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
  const itemsHtml =
    cart.length === 0
      ? emptyStateHtml('🛒', 'Seu carrinho está vazio. Toque nos pratos para adicionar.')
      : cart.map(cartItemRowHtml).join('')
  // Consumido: o destaque de "linha alterada pelo chat" só aparece uma vez,
  // na primeira vez que o carrinho é aberto depois da mudança.
  recentlyChangedProductIds.clear()
  return `
    <div id="cart-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div id="cart-box" class="modal-box bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85dvh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <span class="font-semibold">🛒 Seu carrinho</span>
          <button id="cart-close" title="Fechar" class="text-neutral-400 hover:text-neutral-600 transition text-xl leading-none w-9 h-9 flex items-center justify-center -mr-2">✕</button>
        </div>
        <div class="scroll-contain flex-1 overflow-y-auto px-4 py-3">
          ${itemsHtml}
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
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  // Mensagens que já apareceram em algum render anterior não repetem a
  // animação de entrada — só as recém-adicionadas nesta rodada animam.
  if (chatRenderedCount > chatMessages.length) chatRenderedCount = 0
  const messagesHtml = chatMessages
    .map((m, idx) => chatMessageHtml(m, idx >= chatRenderedCount))
    .join('')
  chatRenderedCount = chatMessages.length

  return `
    <div id="chat-overlay" class="modal-overlay fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div id="chat-box" class="modal-box bg-neutral-50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md h-[88dvh] sm:h-[34rem] flex flex-col overflow-hidden shadow-2xl">
        <div class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-purple to-indigo-600 text-white shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            ${chatAvatarHtml('w-10 h-10 ring-2 ring-white/25')}
            <div class="leading-tight min-w-0">
              <p class="font-semibold text-sm truncate">Ari do PedeAí</p>
              <p class="text-[11px] text-white/75 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Sempre disponível
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${
              cartCount > 0
                ? `<button id="chat-view-cart" title="Ver carrinho" class="relative text-white/90 hover:text-white hover:bg-white/10 transition w-9 h-9 flex items-center justify-center rounded-full text-lg">
                    🛒
                    <span class="absolute top-0.5 right-0.5 bg-brand-orange text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none">${cartCount}</span>
                  </button>`
                : ''
            }
            <button id="chat-close" title="Fechar" class="text-white/80 hover:text-white hover:bg-white/10 transition text-xl leading-none w-9 h-9 flex items-center justify-center rounded-full">✕</button>
          </div>
        </div>
        <div id="chat-messages" class="scroll-contain flex-1 overflow-y-auto px-4 py-4 space-y-4">
          ${messagesHtml}
          ${
            chatLoading
              ? `<div class="flex items-end gap-2 fade-slide-in">
                  ${chatAvatarHtml('w-7 h-7')}
                  <div class="bg-white border border-neutral-100 shadow-sm text-neutral-400 rounded-2xl rounded-bl-md px-4 py-3"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>
                </div>`
              : ''
          }
        </div>
        ${chatSuggestionsHtml()}
        <form id="chat-form" class="safe-bottom flex gap-2 p-3 bg-white border-t border-neutral-100 shrink-0">
          <input
            id="chat-input"
            value="${escapeHtml(chatInput)}"
            placeholder="${notingOrder ? 'Anotando seu pedido…' : 'Ex: algo vegetariano e picante'}"
            autocomplete="off"
            ${notingOrder ? 'disabled' : ''}
            class="flex-1 min-w-0 border border-neutral-300 rounded-full px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-purple transition disabled:bg-neutral-50 disabled:text-neutral-400"
          />
          <button type="submit" ${chatLoading || notingOrder ? 'disabled' : ''} title="Enviar" class="bg-brand-purple text-white rounded-full w-11 h-11 flex items-center justify-center text-base hover:opacity-90 active:scale-95 transition disabled:opacity-50 shrink-0">➤</button>
        </form>
      </div>
    </div>
  `
}

// Sugestões de resposta rápida — mudam um pouco dependendo se já tem algo no
// carrinho, pra sempre serem relevantes. Tocar numa delas envia a frase como
// se o cliente tivesse digitado.
function chatSuggestionsHtml() {
  const suggestions =
    cart.length > 0
      ? ['O que tem no meu carrinho?', 'Pode recomendar uma sobremesa?', 'Quero adicionar mais um item']
      : ['O que vocês recomendam?', 'Tem opção vegetariana?', 'Quero uma bebida']
  const busy = notingOrder || chatLoading
  return `
    <div class="chip-scroll-fade scroll-contain shrink-0 px-3 py-2.5 flex gap-2 overflow-x-auto bg-white border-t border-neutral-100">
      ${suggestions
        .map(
          (s) =>
            `<button data-suggest="${escapeHtml(s)}" ${busy ? 'disabled' : ''} class="text-xs font-medium bg-white border border-neutral-200 text-neutral-600 whitespace-nowrap rounded-full px-3.5 py-2 hover:border-brand-purple hover:text-brand-purple transition shrink-0 shadow-sm disabled:opacity-50">${escapeHtml(s)}</button>`
        )
        .join('')}
    </div>
  `
}

function chatMessageHtml(m, isNew) {
  const entrance = isNew ? 'fade-slide-in' : ''
  if (m.role === 'user') {
    return `
      <div class="flex justify-end ${entrance}">
        <div class="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-brand-purple text-white shadow-sm">${escapeHtml(m.content)}</div>
      </div>
    `
  }
  return `
    <div class="flex items-end gap-2 ${entrance}">
      ${chatAvatarHtml('w-7 h-7')}
      <div class="flex flex-col items-start gap-1.5 max-w-[80%] min-w-0">
        <div class="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-white text-neutral-800 shadow-sm border border-neutral-100">${escapeHtml(m.content)}</div>
        ${m.actionCards && m.actionCards.length > 0 ? actionCardsHtml(m.actionCards, isNew) : ''}
      </div>
    </div>
  `
}

// Ícone/estilo de cada tipo de ação que o Ari executa no carrinho — ver
// applyAiActions(). Cada cartão entra com um pequeno atraso (animation-delay)
// em relação ao anterior, dando a sensação de "anotando aos poucos" sem
// precisar de JS orquestrando a inserção no DOM. "animate" só é true na
// primeira vez que a mensagem é exibida — evita repetir a entrada a cada
// re-render (ver chatRenderedCount em chatModalHtml).
const ACTION_CARD_META = {
  add: { icon: '＋', cls: 'action-card--add' },
  remove: { icon: '－', cls: 'action-card--remove' },
  qty: { icon: '↻', cls: 'action-card--qty' },
  note: { icon: '✎', cls: 'action-card--note' },
}

function actionCardsHtml(cards, animate) {
  return `
    <div class="flex flex-col gap-1.5 w-full">
      ${cards
        .map((c, index) => {
          const meta = ACTION_CARD_META[c.kind] || ACTION_CARD_META.add
          const style = animate ? `animation-delay:${index * 220}ms` : 'animation:none;opacity:1'
          return `
            <div class="action-card ${meta.cls}" style="${style}">
              <span class="action-card-icon" aria-hidden="true">${meta.icon}</span>
              <span class="flex-1 min-w-0">${escapeHtml(c.label)}</span>
            </div>
          `
        })
        .join('')}
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

    const chatViewCartBtn = document.getElementById('chat-view-cart')
    if (chatViewCartBtn) {
      chatViewCartBtn.addEventListener('click', () => {
        chatOpen = false
        cartOpen = true
        renderPage()
      })
    }

    document.querySelectorAll('[data-suggest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (notingOrder || chatLoading) return
        chatInput = btn.getAttribute('data-suggest')
        sendChatMessage({ preventDefault: () => {} })
      })
    })

    // Animação "opcionalmente interrompível": tocar em qualquer lugar do chat
    // enquanto os cartões de ação ainda estão entrando pula direto pro fim.
    if (notingOrder) {
      document.getElementById('chat-box').addEventListener('click', skipStagger)
    }
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

function focusChatInput() {
  const input = document.getElementById('chat-input')
  if (input && !input.disabled) input.focus()
}

function clampQuantity(value) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 1 || n > MAX_ITEM_QUANTITY) return null
  return n
}

// Aplica as ações que o garçom IA decidiu (já validadas pela Edge Function)
// no carrinho local e devolve um cartãozinho descritivo por ação aplicada,
// pra mostrar no chat. Segunda camada de validação, totalmente independente
// da que já rodou no servidor: só mexe no carrinho se o produto realmente
// existir no cardápio carregado e a quantidade for sensata — mesmo que a
// resposta da API venha adulterada, o carrinho nunca fica com item fantasma.
function applyAiActions(acoes) {
  const cards = []
  for (const acao of acoes) {
    if (!acao || typeof acao !== 'object') continue
    const product = products.find((p) => p.id === acao.produto_id)
    if (!product) continue

    if (acao.tipo === 'adicionar') {
      const quantidade = clampQuantity(acao.quantidade)
      if (!quantidade) continue
      const existing = cart.find((i) => i.product.id === product.id)
      if (existing) existing.quantity += quantidade
      else cart.push({ product, quantity: quantidade, notes: '' })
      recentlyChangedProductIds.add(product.id)
      cards.push({ kind: 'add', label: `+${quantidade} ${product.name}` })
      continue
    }

    if (acao.tipo === 'remover') {
      const existing = cart.find((i) => i.product.id === product.id)
      if (!existing) continue
      cart = cart.filter((i) => i.product.id !== product.id)
      cards.push({ kind: 'remove', label: `Removido: ${product.name}` })
      continue
    }

    if (acao.tipo === 'alterar_quantidade') {
      const existing = cart.find((i) => i.product.id === product.id)
      if (!existing) continue
      const quantidade = clampQuantity(acao.quantidade)
      const antes = existing.quantity
      if (!quantidade) {
        cart = cart.filter((i) => i.product.id !== product.id)
        cards.push({ kind: 'remove', label: `Removido: ${product.name}` })
        continue
      }
      existing.quantity = quantidade
      recentlyChangedProductIds.add(product.id)
      cards.push({ kind: 'qty', label: `${product.name}: ${antes} → ${quantidade}` })
      continue
    }

    if (acao.tipo === 'observacao') {
      const existing = cart.find((i) => i.product.id === product.id)
      if (!existing) continue
      const observacao = typeof acao.observacao === 'string' ? acao.observacao.trim().slice(0, 140) : ''
      existing.notes = observacao
      recentlyChangedProductIds.add(product.id)
      cards.push({
        kind: 'note',
        label: observacao ? `${product.name}: "${observacao}"` : `${product.name}: observação removida`,
      })
    }
  }
  return cards
}

function skipStagger() {
  if (staggerTimeoutId) {
    clearTimeout(staggerTimeoutId)
    staggerTimeoutId = null
  }
  if (!notingOrder) return
  notingOrder = false
  renderPage()
  focusChatInput()
}

async function sendChatMessage(e) {
  e.preventDefault()
  const mensagem = chatInput.trim()
  if (!mensagem) return

  // Só os últimos turnos vão pro modelo — mantém o prompt (e o custo por
  // mensagem) limitado mesmo numa conversa longa.
  const historico = chatMessages.slice(-12).map((m) => ({ role: m.role, content: m.content }))
  chatMessages.push({ role: 'user', content: mensagem })
  chatInput = ''
  chatLoading = true
  renderPage()
  focusChatInput()

  let respostaTexto
  let cards = []

  try {
    const anonKey = window.PEDEAI_CONFIG.SUPABASE_ANON_KEY
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/ai-waiter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        restaurante_slug: restaurant.slug,
        mensagem,
        historico,
        nome_cliente: customerName || undefined,
        // O garçom IA precisa saber o que já está no carrinho pra entender
        // "tira a coxinha", "muda a limonada pra três" etc.
        carrinho: cart.map((i) => ({ produto_id: i.product.id, quantidade: i.quantity, observacao: i.notes || null })),
      }),
    })
    const data = await res.json()
    respostaTexto = stripMarkdown(data.resposta) || 'Desculpa, não consegui responder agora.'
    const acoes = Array.isArray(data.acoes) ? data.acoes : []
    cards = applyAiActions(acoes)
  } catch {
    respostaTexto = 'Ops, tive um problema para responder. Tenta de novo?'
  }

  chatMessages.push({ role: 'assistant', content: respostaTexto, actionCards: cards })
  chatLoading = false

  if (cards.length > 0) {
    // Pulsa o botão/contador do carrinho só nesta renderização — o flag volta
    // pra false logo em seguida, então re-renders futuros (digitar, abrir o
    // carrinho etc.) não repetem a animação à toa.
    cartJustUpdated = true
    notingOrder = true
    renderPage()
    cartJustUpdated = false
    const staggerMs = Math.min(cards.length * 220 + 300, 1600)
    staggerTimeoutId = setTimeout(() => {
      staggerTimeoutId = null
      notingOrder = false
      renderPage()
      focusChatInput()
    }, staggerMs)
  } else {
    renderPage()
    focusChatInput()
  }
}

function scrollChatToBottom() {
  const el = document.getElementById('chat-messages')
  if (el) el.scrollTop = el.scrollHeight
}

init()
