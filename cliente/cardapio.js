// cardapio.js — página cliente/index.html?slug=...&mesa=... (equivalente ao antigo /:slug e /:slug/mesa/:numero)
//
// Página pensada mobile-first: é aberta quase sempre a partir do QR Code da
// mesa, direto no navegador do celular do cliente.

const root = document.getElementById('root')
const queryParams = new URLSearchParams(location.search)
const slug = queryParams.get('slug')
const numero = queryParams.get('mesa')

let restaurant = null
let products = []
let categories = []
let cart = []
let cartOpen = false
let placing = false
let placed = false
let chatOpen = false
let chatMessages = []
let chatInput = ''
let chatLoading = false
let expandedProduct = null

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

  chatMessages = [
    {
      role: 'assistant',
      content: `Pede aí! Eu sou o garçom IA do ${restaurant.name}. O que você tá com vontade de comer hoje?`,
    },
  ]

  renderPage()
}

function renderPage() {
  root.innerHTML = pageHtml()
  bindPageEvents()
  // Trava o scroll do fundo da página enquanto algum bottom sheet (chat ou
  // detalhe do produto) está aberto — sem isso, no celular dá pra arrastar a
  // página por trás do modal.
  document.body.style.overflow = chatOpen || expandedProduct ? 'hidden' : ''
  if (chatOpen) scrollChatToBottom()
}

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
          chatOpen || expandedProduct ? 'hidden' : ''
        }"
        style="bottom: calc(6.5rem + env(safe-area-inset-bottom, 0px));"
      >
        💬 Garçom IA
      </button>

      ${cart.length > 0 || placed ? cartBarHtml() : ''}
      ${expandedProduct ? productDetailModalHtml() : ''}
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
    return `<div class="space-y-3">${products.map(productCardHtml).join('')}</div>`
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
      <div class="space-y-3">${g.items.map(productCardHtml).join('')}</div>
    </section>
  `
}

function productImageHtml(p) {
  if (p.image_url) {
    return `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-lg object-cover shrink-0" />`
  }
  return `<div class="img-placeholder w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-lg shrink-0 text-2xl sm:text-3xl">🍽️</div>`
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
// "Adicionar"), pra ler a descrição inteira e os ingredientes sem o corte do
// line-clamp da lista.
function productDetailModalHtml() {
  const p = expandedProduct
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
          <button data-add="${p.id}" data-close-after-add class="w-full bg-brand-purple text-white font-semibold rounded-lg py-3 hover:opacity-90 active:scale-[0.99] transition mt-1">Adicionar ao pedido</button>
        </div>
      </div>
    </div>
  `
}

function cartBarHtml() {
  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  return `
    <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] safe-bottom">
      ${
        cartOpen && cart.length > 0
          ? `
        <div class="scroll-contain max-w-2xl mx-auto px-4 py-3 max-h-56 overflow-y-auto space-y-3 border-b border-neutral-100">
          ${cart
            .map(
              (i) => `
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate pr-2">${escapeHtml(i.product.name)}</span>
              <div class="flex items-center gap-2.5 shrink-0">
                <button data-dec="${i.product.id}" class="qty-btn w-9 h-9 text-base bg-neutral-100 hover:bg-neutral-200 rounded-lg">−</button>
                <span class="w-5 text-center tabular-nums">${i.quantity}</span>
                <button data-inc="${i.product.id}" class="qty-btn w-9 h-9 text-base bg-neutral-100 hover:bg-neutral-200 rounded-lg">+</button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
      <div class="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        ${
          cart.length > 0
            ? `<button id="cart-toggle" class="text-sm text-neutral-500 underline hover:text-neutral-700 transition py-2 -my-2">${cart.length} ${cart.length === 1 ? 'item' : 'itens'} · R$ ${formatBRL(total)}</button>`
            : '<span></span>'
        }
        <button id="place-order-btn" ${placing || placed || cart.length === 0 ? 'disabled' : ''} class="bg-brand-red text-white font-semibold rounded-lg px-5 py-3 hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50 whitespace-nowrap">
          ${placed ? '✓ Pedido enviado!' : placing ? 'Enviando...' : 'Fazer pedido'}
        </button>
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
    btn.addEventListener('click', () => {
      // Botão "Adicionar ao pedido" dentro do modal de detalhe: fecha o modal
      // junto (fica em um render só, em vez de dois).
      if (btn.hasAttribute('data-close-after-add')) expandedProduct = null
      addToCart(btn.getAttribute('data-add'))
    })
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
  }

  const cartToggle = document.getElementById('cart-toggle')
  if (cartToggle) {
    cartToggle.addEventListener('click', () => {
      cartOpen = !cartOpen
      renderPage()
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
  renderPage()
}

function closeProductDetail() {
  expandedProduct = null
  renderPage()
}

function addToCart(productId) {
  const product = products.find((p) => p.id === productId)
  if (!product) return
  const existing = cart.find((i) => i.product.id === productId)
  if (existing) existing.quantity += 1
  else cart.push({ product, quantity: 1 })
  renderPage()
}

function updateQuantity(productId, delta) {
  cart = cart
    .map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i))
    .filter((i) => i.quantity > 0)
  renderPage()
}

async function placeOrder() {
  placing = true
  renderPage()
  try {
    const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({ restaurant_id: restaurant.id, table_number: numero ? Number(numero) : null, total })
      .select()
      .single()
    if (orderError) throw orderError

    const items = cart.map((i) => ({
      order_id: order.id,
      product_id: i.product.id,
      product_name: i.product.name,
      quantity: i.quantity,
      unit_price: i.product.price,
    }))
    const { error: itemsError } = await supabaseClient.from('order_items').insert(items)
    if (itemsError) throw itemsError

    placing = false
    placed = true
    cart = []
    renderPage()
    showToast('Pedido enviado com sucesso!', 'success')
    setTimeout(() => {
      placed = false
      cartOpen = false
      renderPage()
    }, 2500)
  } catch (err) {
    placing = false
    renderPage()
    showToast('Erro ao enviar pedido: ' + (err instanceof Error ? err.message : String(err)), 'error', 5000)
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
      body: JSON.stringify({ restaurante_slug: restaurant.slug, mensagem, historico }),
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
