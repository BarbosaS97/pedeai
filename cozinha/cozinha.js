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

// Senha só de UI (mesmo espírito do gate de admin/index.html — não é
// autenticação real, é só pra evitar que alguém zere a fila sem querer,
// encostando na tela por engano). Trocar aqui se precisar de outra senha.
const KITCHEN_RESET_PASSWORD = '123'

// Ícones em SVG em vez de emoji: emoji renderiza de formas bem diferentes
// (às vezes preto e branco, às vezes faltando o glifo) dependendo do tablet
// Android barato que costuma ficar fixado na cozinha — SVG é consistente em
// qualquer aparelho e some totalmente se um dia quisermos reestilizar.
const ICONS = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s-6 5.8-6 11.2A6 6 0 0 0 12 21a6 6 0 0 0 6-6.8c0-1.6-.6-2.9-1.5-3.9.1 1.5-.8 2.4-1.7 2.4C15.6 10.5 14 8.6 14 6.4c0-1.2-.6-2.4-2-4.4Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a9 9 0 0 1 0 12"/></svg>',
  volumeMuted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  tray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="9" rx="1.5"/><path d="M3 10 7 4h10l4 6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
}

function icon(name, cls = 'w-5 h-5') {
  return (ICONS[name] || '').replace('<svg ', `<svg class="${cls}" `)
}

let restaurantClient = null
let restaurant = null

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

  // Poll em vez de Supabase Realtime: o RLS de "orders"/"order_items"
  // (current_restaurant_token(), migration 0001) só libera leitura pra quem
  // manda o header x-restaurant-token, e esse header só existe em requests
  // REST normais — o serviço de Realtime não o recebe, então o canal
  // "inscreve" com sucesso mas nunca vê eventos de pedidos feitos por outro
  // cliente (confirmado testando: o pedido só aparece depois de um F5). Poll
  // a cada 4s resolve sem abrir mão dessa proteção — cada tick já reconcilia
  // o DOM sem piscar (ver reconcileList) e também cobre a atualização do
  // selo de tempo decorrido, então não precisa de um timer separado pra isso.
  setInterval(fetchTodayOrders, 4000)
}

// ---- Estrutura fixa da tela (renderizada uma vez) ----

function renderShell() {
  root.innerHTML = `
    <div class="h-screen flex flex-col bg-neutral-100">
      <header class="bg-white border-b border-neutral-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div class="flex items-center gap-4">
          ${renderLogo({ size: 'sm' })}
          <div class="h-8 w-px bg-neutral-200 hidden sm:block"></div>
          <p class="text-sm text-neutral-500">${escapeHtml(restaurant.name)} <span class="text-neutral-300">·</span> Cozinha</p>
        </div>

        <div id="queue-summary" class="flex items-center gap-2 text-sm font-bold text-neutral-700 bg-neutral-100 rounded-full px-4 py-2"></div>

        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mr-1">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>Atualização automática
          </span>
          <button id="sound-toggle-btn" class="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 transition">
            <span class="w-5 h-5">${icon('volume')}</span>Ativar som
          </button>
          <button id="reset-btn" class="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border-2 border-red-200 text-brand-red hover:bg-red-50 transition">
            <span class="w-5 h-5">${icon('refresh')}</span>Zerar dia
          </button>
          <button id="history-btn" class="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-neutral-900 text-white hover:opacity-90 transition">
            <span class="w-5 h-5">${icon('clock')}</span>Histórico <span id="history-count" class="opacity-70">0</span>
          </button>
        </div>
      </header>

      <main class="flex-1 flex gap-4 p-4 overflow-hidden">
        <section id="col-pending" class="flex-1 flex flex-col bg-amber-50 border-2 border-amber-200 rounded-2xl overflow-hidden min-w-0">
          <div class="px-5 py-4 bg-amber-100 border-b-2 border-amber-200 flex items-center justify-between shrink-0">
            <h2 class="flex items-center gap-2 text-xl font-extrabold text-amber-800"><span class="w-6 h-6 shrink-0">${icon('bell', 'w-6 h-6')}</span>Pedidos novos</h2>
            <span id="pending-count" class="text-lg font-extrabold text-amber-800 bg-white/70 rounded-full w-9 h-9 flex items-center justify-center shrink-0">0</span>
          </div>
          <div id="pending-list" class="flex-1 overflow-y-auto scroll-contain p-4">${skeletonCardsHtml(2)}</div>
        </section>

        <section id="col-preparing" class="flex-1 flex flex-col bg-blue-50 border-2 border-blue-200 rounded-2xl overflow-hidden min-w-0">
          <div class="px-5 py-4 bg-blue-100 border-b-2 border-blue-200 flex items-center justify-between shrink-0">
            <h2 class="flex items-center gap-2 text-xl font-extrabold text-blue-800"><span class="w-6 h-6 shrink-0">${icon('flame', 'w-6 h-6')}</span>Em preparo</h2>
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
  document.getElementById('reset-btn').addEventListener('click', openResetModal)
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

function resetStorageKey() {
  return `pedeai_kitchen_reset_${restaurant.id}`
}

// A fila só zera quando alguém aperta "Zerar dia" e confirma a senha — nunca
// sozinha à meia-noite. Isso importa pra restaurante que funciona virada a
// noite (a numeração não pode picar no meio do turno só porque o relógio
// virou dia). Sem nenhum reset manual ainda feito neste aparelho, cai no
// início do dia de hoje, só pra não puxar o histórico inteiro da vida do
// restaurante na primeira vez que a tela é aberta.
function getQueueStartIso() {
  try {
    const stored = localStorage.getItem(resetStorageKey())
    if (stored) return stored
  } catch {
    // localStorage indisponível (modo privado etc.) — cai no padrão abaixo.
  }
  return startOfTodayIso()
}

async function fetchTodayOrders() {
  const { data, error } = await restaurantClient
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', restaurant.id)
    .gte('created_at', getQueueStartIso())
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

// Visão geral da fila (pending + preparing juntos): quantos pedidos ainda
// faltam e até qual código eles vão. É o "aviso visual" que deixa o
// cozinheiro saber, enquanto prepara o #9, que já tem pedido até o #15
// esperando — sem precisar rolar as duas colunas contando um por um.
function activeQueueSummary() {
  const active = todayOrders.filter((o) => o.status === 'pending' || o.status === 'preparing')
  if (active.length === 0) return null
  const codes = active.map((o) => codeForOrder(o.id))
  return { count: active.length, min: Math.min(...codes), max: Math.max(...codes) }
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

  const summaryEl = document.getElementById('queue-summary')
  if (summaryEl) {
    const summary = activeQueueSummary()
    summaryEl.innerHTML = summary
      ? summary.min === summary.max
        ? `Fila: pedido #${summary.max}`
        : `Fila: ${summary.count} pedido${summary.count > 1 ? 's' : ''} · #${summary.min} a #${summary.max}`
      : 'Fila vazia'
  }

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
        ? emptyStateHtml(icon('tray', 'w-10 h-10'), 'Nenhum pedido novo agora.')
        : emptyStateHtml(icon('flame', 'w-10 h-10'), 'Nada em preparo no momento.')
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
  const clockTime = new Date(baseTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const items = (order.order_items || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const actionLabel = stage === 'pending' ? 'PREPARAR' : 'PRONTO'
  const actionIcon = stage === 'pending' ? 'arrowRight' : 'check'
  const actionClasses = stage === 'pending' ? 'bg-brand-blue' : 'bg-emerald-600'

  return `
    <div class="fade-slide-in bg-white border-2 border-neutral-200 rounded-2xl p-5 mb-4 shadow-sm" data-order-card="${order.id}">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="min-w-0">
          <p class="text-3xl font-extrabold text-neutral-900 leading-none">#${code}</p>
          <p class="text-lg font-semibold text-neutral-700 mt-2 truncate">${order.table_number ? `Mesa ${escapeHtml(order.table_number)}` : 'Balcão'}</p>
          ${order.customer_name ? `<p class="text-sm text-neutral-500 truncate mt-0.5">${escapeHtml(order.customer_name)}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span data-elapsed-badge class="text-sm font-bold px-3 py-1.5 rounded-full border ${colorClasses}">${elapsedLabel(minutes)}</span>
          <span class="text-xs text-neutral-400">${clockTime}</span>
        </div>
      </div>
      <ul class="divide-y divide-neutral-100 mb-4 border-t border-b border-neutral-100">
        ${
          items.length
            ? items
                .map(
                  (item) => `
          <li class="text-xl leading-snug py-3">
            <span class="font-extrabold text-neutral-900">${item.quantity}×</span>
            <span class="text-neutral-800">${escapeHtml(item.product_name)}</span>
            ${item.notes ? `<div class="flex items-start gap-1.5 text-base font-bold text-brand-red bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-1.5"><span class="w-4 h-4 shrink-0 mt-0.5">${icon('warning', 'w-4 h-4')}</span><span>ATENÇÃO: ${escapeHtml(item.notes)}</span></div>` : ''}
          </li>
        `
                )
                .join('')
            : `<li class="text-sm text-neutral-400 italic py-3">Carregando itens...</li>`
        }
      </ul>
      <button data-action="${stage === 'pending' ? 'prepare' : 'ready'}" data-id="${order.id}" class="w-full flex items-center justify-center gap-2 text-white text-xl font-bold rounded-xl py-4 active:scale-[0.98] hover:opacity-90 transition ${actionClasses}">
        <span class="w-6 h-6">${icon(actionIcon, 'w-6 h-6')}</span>${actionLabel}
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
          <h2 class="text-xl font-bold">Histórico</h2>
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
    return emptyStateHtml(icon('archive', 'w-10 h-10'), 'Nenhum pedido concluído ainda hoje.')
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

// ---- Zerar dia (reinicia a numeração no #1) ----

function openResetModal() {
  document.body.insertAdjacentHTML('beforeend', resetModalHtml())
  const overlay = document.getElementById('reset-overlay')
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeResetModal()
  })
  document.getElementById('reset-cancel-btn').addEventListener('click', closeResetModal)
  document.getElementById('reset-form').addEventListener('submit', handleResetSubmit)
  document.getElementById('reset-password-input').focus()
}

function closeResetModal() {
  const el = document.getElementById('reset-overlay')
  if (el) el.remove()
}

function resetModalHtml() {
  const activeCount = todayOrders.filter((o) => o.status === 'pending' || o.status === 'preparing').length
  return `
    <div id="reset-overlay" class="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <form id="reset-form" class="modal-box bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
        <div>
          <h2 class="text-lg font-bold">Zerar numeração do dia</h2>
          <p class="text-sm text-neutral-500 mt-1">A fila e o histórico atuais somem da tela e o próximo pedido volta a ser #1. Use no começo de cada dia de trabalho.</p>
        </div>
        ${
          activeCount > 0
            ? `<div class="flex items-start gap-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span class="w-5 h-5 shrink-0">${icon('warning', 'w-5 h-5')}</span>
                <span>Ainda há ${activeCount} pedido${activeCount > 1 ? 's' : ''} em andamento. ${activeCount > 1 ? 'Eles vão sumir' : 'Ele vai sumir'} da tela até serem finalizados outra hora.</span>
              </div>`
            : ''
        }
        <div>
          <input id="reset-password-input" type="password" inputmode="numeric" autocomplete="off" placeholder="Senha" class="w-full border border-neutral-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition" />
          <p id="reset-error" class="text-sm text-brand-red mt-1.5 hidden">Senha incorreta.</p>
        </div>
        <div class="flex gap-2 pt-1">
          <button type="button" id="reset-cancel-btn" class="flex-1 bg-neutral-100 text-neutral-700 font-semibold rounded-lg py-2.5 hover:bg-neutral-200 transition">Cancelar</button>
          <button type="submit" class="flex-1 bg-brand-red text-white font-semibold rounded-lg py-2.5 hover:opacity-90 transition">Confirmar</button>
        </div>
      </form>
    </div>
  `
}

function handleResetSubmit(e) {
  e.preventDefault()
  const input = document.getElementById('reset-password-input')
  if (input.value !== KITCHEN_RESET_PASSWORD) {
    document.getElementById('reset-error').classList.remove('hidden')
    input.value = ''
    input.focus()
    return
  }

  try {
    localStorage.setItem(resetStorageKey(), new Date().toISOString())
  } catch {
    // localStorage indisponível — o reset ainda funciona pra esta sessão via
    // fetchTodayOrders() abaixo, só não sobrevive a um recarregamento de página.
  }

  closeResetModal()
  fetchTodayOrders()
  showToast('Numeração zerada — o próximo pedido começa em #1.', 'success')
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
  btn.innerHTML = `<span class="w-5 h-5">${icon('volume', 'w-5 h-5')}</span>Som ativado`
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
