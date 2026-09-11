// cozinha.js — página cozinha/index.html?token=...
//
// Tela dedicada para tablet fixo na cozinha: duas colunas (pedidos novos /
// em preparo), pensada pra ser lida de longe e usada sem treinamento. Usa o
// mesmo client autenticado por token do painel do restaurante
// (createRestaurantClient, ver js/supabase-client.js) e o mesmo campo
// "status" da tabela orders (pending/preparing/ready — ver migration
// 0007_orders_status.sql para o porquê de não termos criado valores novos
// em português).

const root = document.getElementById('root')
const accessToken = new URLSearchParams(location.search).get('token')

// Cinza nos primeiros minutos, amarelo quando começa a demorar, vermelho
// quando está atrasado. Limites em minutos, ajustáveis aqui. "Em preparo"
// tolera mais tempo que "novo" porque preparar o prato em si já leva tempo.
const ELAPSED_THRESHOLDS = {
  pending: { yellow: 5, red: 10 },
  preparing: { yellow: 10, red: 18 },
}

let restaurantClient = null
let restaurant = null
let realtimeChannel = null

let todayOrders = []
let historyOpen = false
let initialLoadDone = false
const seenOrderIds = new Set()
const itemsRetryCount = new Map()

// Nó DOM de cada card, indexado por id do pedido. Reaproveitado entre
// re-renderizações (reconcileList) para só tocar no DOM do que realmente
// mudou — sem isso, qualquer evento do Realtime (inclusive de um pedido que
// não tem nada a ver) recriava a lista inteira e a tela "piscava" a cada
// poucos segundos.
const pendingNodes = new Map()
const preparingNodes = new Map()

let audioCtx = null
let soundUnlocked = false

async function init() {
  if (!accessToken) {
    root.innerHTML = notFoundHtml('Link inválido ou revogado. Fale com o administrador.')
    return
  }

  restaurantClient = createRestaurantClient(accessToken)
  root.innerHTML = loadingHtml('Carregando cozinha...')

  const { data } = await restaurantClient
    .from('restaurants')
    .select('*')
    .eq('access_token', accessToken)
    .maybeSingle()

  if (!data) {
    root.innerHTML = notFoundHtml('Link inválido ou revogado. Fale com o administrador.')
    return
  }
  restaurant = data

  renderShell()
  await fetchTodayOrders()
  subscribeRealtime()

  // Atualiza só o texto/cor do tempo decorrido periodicamente — nunca
  // reconstrói os cards (ver updateElapsedBadges), então não pisca.
  setInterval(updateElapsedBadges, 20000)
}

// ---- Estrutura fixa da tela (renderizada uma vez) ----

function renderShell() {
  root.innerHTML = `
    <div class="h-screen flex flex-col bg-neutral-100">
      <header class="bg-white border-b border-neutral-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div class="flex items-center gap-3">
          ${renderLogo({ size: 'sm' })}
          <p class="text-sm text-neutral-500">${escapeHtml(restaurant.name)} · Cozinha</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>ao vivo
          </span>
          <button id="sound-toggle-btn" class="text-sm font-semibold px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 transition">🔈 Ativar som</button>
          <button id="history-btn" class="text-sm font-semibold px-4 py-2 rounded-lg bg-neutral-900 text-white hover:opacity-90 transition">
            🕘 Histórico <span id="history-count" class="ml-1 opacity-70">0</span>
          </button>
        </div>
      </header>

      <main class="flex-1 flex gap-4 p-4 overflow-hidden">
        <section id="col-pending" class="flex-1 flex flex-col bg-amber-50 border-2 border-amber-200 rounded-2xl overflow-hidden min-w-0">
          <div class="px-5 py-4 bg-amber-100 border-b-2 border-amber-200 flex items-center justify-between shrink-0">
            <h2 class="text-xl font-extrabold text-amber-800">🔔 Pedidos novos</h2>
            <span id="pending-count" class="text-lg font-extrabold text-amber-800 bg-white/70 rounded-full w-9 h-9 flex items-center justify-center shrink-0">0</span>
          </div>
          <div id="pending-list" class="flex-1 overflow-y-auto scroll-contain p-4">${skeletonCardsHtml(2)}</div>
        </section>

        <section id="col-preparing" class="flex-1 flex flex-col bg-blue-50 border-2 border-blue-200 rounded-2xl overflow-hidden min-w-0">
          <div class="px-5 py-4 bg-blue-100 border-b-2 border-blue-200 flex items-center justify-between shrink-0">
            <h2 class="text-xl font-extrabold text-blue-800">🔥 Em preparo</h2>
            <span id="preparing-count" class="text-lg font-extrabold text-blue-800 bg-white/70 rounded-full w-9 h-9 flex items-center justify-center shrink-0">0</span>
          </div>
          <div id="preparing-list" class="flex-1 overflow-y-auto scroll-contain p-4">${skeletonCardsHtml(2)}</div>
        </section>
      </main>
    </div>
  `

  document.getElementById('col-pending').addEventListener('click', handleColumnClick)
  document.getElementById('col-preparing').addEventListener('click', handleColumnClick)
  document.getElementById('sound-toggle-btn').addEventListener('click', handleSoundToggleClick)
  document.getElementById('history-btn').addEventListener('click', openHistory)
}

function handleColumnClick(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const id = btn.getAttribute('data-id')
  const action = btn.getAttribute('data-action')
  if (action === 'prepare') markPreparing(id)
  if (action === 'ready') markReady(id)
}

// ---- Dados: pedidos de hoje (todos os status, para numerar e alimentar o histórico) ----

function startOfTodayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

async function fetchTodayOrders() {
  const { data, error } = await restaurantClient
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', restaurant.id)
    .gte('created_at', startOfTodayIso())
    .order('created_at', { ascending: true })

  if (error) {
    showToast('Erro ao carregar pedidos.', 'error')
    return
  }

  const orders = data || []

  // Toca o alerta só pra pedidos "pending" que a gente ainda não tinha visto
  // — nunca no primeiro carregamento da tela (senão toca um estrondo de sons
  // assim que o tablet liga, pros pedidos que já estavam lá).
  const newArrivals = orders.filter((o) => o.status === 'pending' && !seenOrderIds.has(o.id))
  orders.forEach((o) => seenOrderIds.add(o.id))

  todayOrders = orders
  renderColumns()
  if (historyOpen) renderHistoryList()

  if (initialLoadDone && newArrivals.length > 0) {
    playNewOrderChime()
  }
  initialLoadDone = true

  scheduleItemsRetryIfNeeded(orders)
}

// O cardápio (cliente/cardapio.js) insere o pedido e os itens em duas
// chamadas separadas. Se o Realtime nos acordar bem entre as duas, o card
// aparece sem itens por um instante — tenta de novo (até 3x, pouco depois),
// pra nunca deixar um pedido "travado" sem detalhes na tela.
function scheduleItemsRetryIfNeeded(orders) {
  const now = Date.now()
  const needsRetry = orders.some((o) => {
    if (o.order_items.length > 0) return false
    if (now - new Date(o.created_at).getTime() >= 20000) return false
    return (itemsRetryCount.get(o.id) || 0) < 3
  })
  if (!needsRetry) return
  orders.forEach((o) => {
    if (o.order_items.length === 0) itemsRetryCount.set(o.id, (itemsRetryCount.get(o.id) || 0) + 1)
  })
  setTimeout(fetchTodayOrders, 1500)
}

function codeForOrder(orderId) {
  const idx = todayOrders.findIndex((o) => o.id === orderId)
  return idx === -1 ? '?' : idx + 1
}

function pendingOrders() {
  return todayOrders.filter((o) => o.status === 'pending')
}

function preparingOrders() {
  return todayOrders
    .filter((o) => o.status === 'preparing')
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
}

function historyOrders() {
  return todayOrders
    .filter((o) => o.status === 'ready' || o.status === 'completed' || o.status === 'cancelled')
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
}

// ---- Ações ----

async function markPreparing(orderId) {
  const { error } = await restaurantClient.from('orders').update({ status: 'preparing' }).eq('id', orderId)
  if (error) {
    showToast('Erro ao mover pedido para preparo.', 'error')
    return
  }
  const order = todayOrders.find((o) => o.id === orderId)
  if (order) {
    order.status = 'preparing'
    order.updated_at = new Date().toISOString()
  }
  renderColumns()
}

async function markReady(orderId) {
  const code = codeForOrder(orderId)
  const { error } = await restaurantClient.from('orders').update({ status: 'ready' }).eq('id', orderId)
  if (error) {
    showToast('Erro ao concluir pedido.', 'error')
    return
  }
  const order = todayOrders.find((o) => o.id === orderId)
  if (order) {
    order.status = 'ready'
    order.updated_at = new Date().toISOString()
  }
  renderColumns()
  showToast(`Pedido #${code} enviado para o histórico.`, 'success')
}

// ---- Colunas ----
//
// Reconciliação com chave por id de pedido, em vez de jogar tudo fora e
// reconstruir a lista a cada fetch/evento do Realtime: um card só é
// recriado (e só então reanima com fade-slide-in) se for novo na coluna ou
// se seu conteúdo (itens/observações/mesa/cliente) realmente mudou. Cards
// inalterados nem são tocados — é o que evita a tela inteira "piscar"
// toda vez que qualquer pedido muda de status em qualquer coluna.

function renderColumns() {
  const pendingList = document.getElementById('pending-list')
  const preparingList = document.getElementById('preparing-list')
  if (!pendingList || !preparingList) return

  const pending = pendingOrders()
  const preparing = preparingOrders()

  reconcileList(pendingList, pendingNodes, pending, 'pending')
  reconcileList(preparingList, preparingNodes, preparing, 'preparing')

  document.getElementById('pending-count').textContent = pending.length
  document.getElementById('preparing-count').textContent = preparing.length
  const historyCountEl = document.getElementById('history-count')
  if (historyCountEl) historyCountEl.textContent = historyOrders().length

  updateElapsedBadges()
}

function htmlToElement(html) {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  return template.content.firstElementChild
}

// Tudo que, se mudar, exige recriar o card. Tempo decorrido fica de fora de
// propósito — esse é atualizado à parte, sem recriar nada (updateElapsedBadges).
function cardSignature(order) {
  const items = (order.order_items || [])
    .map((i) => `${i.id}:${i.quantity}:${i.product_name}:${i.notes || ''}`)
    .join('|')
  return [order.table_number, order.customer_name, items].join('~')
}

function reconcileList(listEl, nodesMap, orders, stage) {
  if (orders.length === 0) {
    nodesMap.clear()
    listEl.innerHTML =
      stage === 'pending'
        ? emptyStateHtml('🍽️', 'Nenhum pedido novo agora.')
        : emptyStateHtml('👨‍🍳', 'Nada em preparo no momento.')
    return
  }

  // Saindo do estado vazio (empty state) para o primeiro card.
  if (nodesMap.size === 0) listEl.innerHTML = ''

  const seenIds = new Set()
  let previous = null

  orders.forEach((order) => {
    seenIds.add(order.id)
    const signature = cardSignature(order)
    let node = nodesMap.get(order.id)

    if (!node) {
      node = htmlToElement(orderCardHtml(order, stage))
      node.dataset.signature = signature
      nodesMap.set(order.id, node)
    } else if (node.dataset.signature !== signature) {
      const fresh = htmlToElement(orderCardHtml(order, stage))
      fresh.dataset.signature = signature
      node.replaceWith(fresh)
      node = fresh
      nodesMap.set(order.id, node)
    }

    // Garante a posição certa (fila ordenada por tempo de espera) sem
    // recriar nós que já estão no lugar certo.
    if (previous === null) {
      if (listEl.firstElementChild !== node) listEl.insertBefore(node, listEl.firstElementChild)
    } else if (previous.nextElementSibling !== node) {
      previous.after(node)
    }
    previous = node
  })

  nodesMap.forEach((node, id) => {
    if (!seenIds.has(id)) {
      node.remove()
      nodesMap.delete(id)
    }
  })
}

// Só troca o texto/classes do selo de tempo decorrido de cada card já
// existente — nenhum innerHTML de lista é tocado, então isso nunca pisca.
function updateElapsedBadges() {
  updateElapsedBadgesForMap(pendingNodes, pendingOrders(), 'pending')
  updateElapsedBadgesForMap(preparingNodes, preparingOrders(), 'preparing')
}

function updateElapsedBadgesForMap(nodesMap, orders, stage) {
  orders.forEach((order) => {
    const node = nodesMap.get(order.id)
    const badge = node && node.querySelector('[data-elapsed-badge]')
    if (!badge) return
    const baseTime = stage === 'pending' ? order.created_at : order.updated_at
    const minutes = elapsedMinutes(baseTime)
    badge.textContent = elapsedLabel(minutes)
    badge.className = `text-sm font-bold px-3 py-1.5 rounded-full border shrink-0 ${elapsedColorClasses(minutes, stage)}`
  })
}

function elapsedMinutes(fromIso) {
  return (Date.now() - new Date(fromIso).getTime()) / 60000
}

function elapsedLabel(minutes) {
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${Math.floor(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  return `${h}h${m > 0 ? ` ${m}min` : ''}`
}

function elapsedColorClasses(minutes, stage) {
  const t = ELAPSED_THRESHOLDS[stage]
  if (minutes >= t.red) return 'bg-red-100 text-red-700 border-red-300'
  if (minutes >= t.yellow) return 'bg-amber-100 text-amber-700 border-amber-300'
  return 'bg-neutral-200 text-neutral-500 border-neutral-300'
}

function orderCardHtml(order, stage) {
  const code = codeForOrder(order.id)
  const baseTime = stage === 'pending' ? order.created_at : order.updated_at
  const minutes = elapsedMinutes(baseTime)
  const colorClasses = elapsedColorClasses(minutes, stage)
  const items = (order.order_items || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const actionLabel = stage === 'pending' ? '▶️ Preparar' : '✅ Pronto'
  const actionClasses = stage === 'pending' ? 'bg-brand-blue' : 'bg-emerald-600'

  return `
    <div class="fade-slide-in bg-white border-2 border-neutral-200 rounded-2xl p-5 mb-4 shadow-sm" data-order-card="${order.id}">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="min-w-0">
          <p class="text-3xl font-extrabold text-neutral-900 leading-none">#${code}</p>
          <p class="text-lg font-semibold text-neutral-700 mt-1.5 truncate">${order.table_number ? `Mesa ${escapeHtml(order.table_number)}` : 'Balcão'}</p>
          ${order.customer_name ? `<p class="text-sm text-neutral-500 truncate">👤 ${escapeHtml(order.customer_name)}</p>` : ''}
        </div>
        <span data-elapsed-badge class="text-sm font-bold px-3 py-1.5 rounded-full border shrink-0 ${colorClasses}">${elapsedLabel(minutes)}</span>
      </div>
      <ul class="space-y-3 mb-4">
        ${
          items.length
            ? items
                .map(
                  (item) => `
          <li class="text-xl leading-snug">
            <span class="font-extrabold text-neutral-900">${item.quantity}×</span>
            <span class="text-neutral-800">${escapeHtml(item.product_name)}</span>
            ${item.notes ? `<div class="text-base font-bold text-brand-red bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 mt-1 inline-block">⚠️ ${escapeHtml(item.notes)}</div>` : ''}
          </li>
        `
                )
                .join('')
            : `<li class="text-sm text-neutral-400 italic">Carregando itens...</li>`
        }
      </ul>
      <button data-action="${stage === 'pending' ? 'prepare' : 'ready'}" data-id="${order.id}" class="w-full text-white text-xl font-bold rounded-xl py-4 active:scale-[0.98] hover:opacity-90 transition ${actionClasses}">
        ${actionLabel}
      </button>
    </div>
  `
}

// ---- Histórico do dia (sobreposição) ----

function openHistory() {
  historyOpen = true
  document.body.insertAdjacentHTML('beforeend', historyOverlayHtml())
  const overlay = document.getElementById('history-overlay')
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeHistory()
  })
  document.getElementById('history-close-btn').addEventListener('click', closeHistory)
}

function closeHistory() {
  historyOpen = false
  const el = document.getElementById('history-overlay')
  if (el) el.remove()
}

function renderHistoryList() {
  const el = document.getElementById('history-list-body')
  if (el) el.innerHTML = historyRowsHtml()
}

function historyOverlayHtml() {
  return `
    <div id="history-overlay" class="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div class="modal-box bg-white rounded-2xl p-6 max-w-5xl w-full max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between mb-4 shrink-0">
          <h2 class="text-xl font-bold">Histórico de hoje</h2>
          <button id="history-close-btn" class="bg-neutral-100 hover:bg-neutral-200 rounded-lg px-4 py-2 font-semibold transition">← Voltar</button>
        </div>
        <div class="overflow-y-auto scroll-contain flex-1" id="history-list-body">
          ${historyRowsHtml()}
        </div>
      </div>
    </div>
  `
}

function historyRowsHtml() {
  const rows = historyOrders()
  if (rows.length === 0) {
    return emptyStateHtml('🗂️', 'Nenhum pedido concluído ainda hoje.')
  }
  return `
    <table class="w-full text-sm">
      <thead class="sticky top-0 bg-white">
        <tr class="text-left text-neutral-400 border-b border-neutral-200">
          <th class="py-2 pr-3">Código</th>
          <th class="py-2 pr-3">Mesa</th>
          <th class="py-2 pr-3">Cliente</th>
          <th class="py-2 pr-3">Itens</th>
          <th class="py-2 pr-3">Entrada</th>
          <th class="py-2 pr-3">Saída</th>
          <th class="py-2 pr-3">Tempo de preparo</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(historyRowHtml).join('')}
      </tbody>
    </table>
  `
}

function historyRowHtml(order) {
  const code = codeForOrder(order.id)
  const items = (order.order_items || []).map((i) => `${i.quantity}× ${escapeHtml(i.product_name)}`).join(', ')
  const entrada = new Date(order.created_at)
  const saida = new Date(order.updated_at)
  const totalMin = Math.max(0, Math.round((saida - entrada) / 60000))
  return `
    <tr class="border-b border-neutral-100 align-top">
      <td class="py-2 pr-3 font-bold whitespace-nowrap">#${code}</td>
      <td class="py-2 pr-3 whitespace-nowrap">${order.table_number ? `Mesa ${escapeHtml(order.table_number)}` : 'Balcão'}</td>
      <td class="py-2 pr-3 whitespace-nowrap">${escapeHtml(order.customer_name || '—')}</td>
      <td class="py-2 pr-3 max-w-xs">${items || '—'}</td>
      <td class="py-2 pr-3 whitespace-nowrap">${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td class="py-2 pr-3 whitespace-nowrap">${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td class="py-2 pr-3 font-semibold whitespace-nowrap">${totalMin} min</td>
    </tr>
  `
}

// ---- Tempo real ----

function subscribeRealtime() {
  realtimeChannel = restaurantClient
    .channel(`kitchen-orders-${restaurant.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
      () => fetchTodayOrders()
    )
    // order_items não tem restaurant_id pra filtrar na assinatura; o RLS
    // (order_items_select_by_token) já restringe o que este client consegue
    // de fato buscar de volta na re-consulta feita logo abaixo.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchTodayOrders())
    .subscribe()
}

// ---- Som de alerta ----
// Gerado por Web Audio (sem arquivo de áudio externo). Navegadores bloqueiam
// autoplay sem interação prévia, então o AudioContext só é criado/desbloqueado
// no clique do cozinheiro em "Ativar som" — depois disso, toca sozinho
// enquanto a aba ficar aberta (é assim que um tablet fixo na cozinha usa).
function handleSoundToggleClick() {
  ensureAudioUnlocked()
  playNewOrderChime()
  const btn = document.getElementById('sound-toggle-btn')
  btn.textContent = '🔊 Som ativado'
  btn.disabled = true
  btn.classList.add('opacity-60', 'cursor-default')
}

function ensureAudioUnlocked() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  soundUnlocked = true
}

function playNewOrderChime() {
  if (!soundUnlocked || !audioCtx) return
  const now = audioCtx.currentTime
  ;[880, 1175].forEach((freq, i) => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = now + i * 0.16
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.35, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(start)
    osc.stop(start + 0.3)
  })
}

init()
