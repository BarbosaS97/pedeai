// cardapio.js — página cliente/index.html?slug=...&mesa=... (equivalente ao antigo /:slug e /:slug/mesa/:numero)
//
// Página pensada mobile-first: é aberta quase sempre a partir do QR Code da
// mesa, direto no navegador do celular do cliente.

const root = document.getElementById('root')
const queryParams = new URLSearchParams(location.search)
const slug = queryParams.get('slug')
const numero = queryParams.get('mesa')

const CUSTOMER_STORAGE_KEY = 'pedeai_customer'
const CHAT_AVATAR_URL = '../images/avatar.png'

// URL da landing page pública do PapeiAI — usada só no link "PapeiAI" do
// rodapé (pageHtml). Mesma lógica de "resolve a partir de onde a página está
// rodando agora" de menuUrl()/panelUrl() (js/qrcode-helper.js, usadas no
// admin/painel): se PEDEAI_CONFIG.APP_URL estiver configurado, usa ele;
// senão sobe uma pasta a partir de cliente/index.html.
function landingUrl() {
  const configured = window.PEDEAI_CONFIG.APP_URL
  return configured ? configured.replace(/\/?$/, '/') : new URL('../', window.location.href).href
}

// A foto do Ari (images/avatar.png) é um retrato de corpo inteiro (rosto só
// no terço de cima, braços cruzados ocupam o centro) — object-cover puro
// centraliza o corte no meio da imagem e mostra os braços/avental, não o
// rosto. Por isso o zoom (scale) e a origem ficam fixados perto do topo,
// pra recortar só a região da cabeça. Um anel fino no wrapper serve de
// moldura, separando o avatar do fundo em vez de esticar a foto até a borda.
function chatAvatarHtml(sizeClass) {
  return `<span class="${sizeClass} rounded-full bg-brand-orange/15 flex items-center justify-center overflow-hidden"><img src="${CHAT_AVATAR_URL}" alt="Ari" loading="eager" class="w-full h-full rounded-full object-cover" style="object-position: 50% 12%; transform: scale(1.55); transform-origin: 50% 15%;" /></span>`
}

// Ícones de contorno simples (sem emoji) usados no formulário de boas-vindas.
const ICON_PERSON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
const ICON_CART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/></svg>`
// Ícone estilo WhatsApp (bolha de fala com o "gancho" do telefone) — usado só
// no botão "Enviar pedido no WhatsApp" do carrinho, quando o restaurante tem
// número cadastrado (restaurants.whatsapp, migration 0013).
const ICON_WHATSAPP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.16 2 11.29c0 2.01.73 3.86 1.98 5.39L2.6 21.4a.5.5 0 0 0 .62.62l4.9-1.43a10.4 10.4 0 0 0 3.88.76c5.52 0 10-4.16 10-9.29S17.52 2 12 2Zm5.2 13.13c-.22.62-1.28 1.19-1.77 1.24-.45.05-.91.23-3.06-.64-2.59-1.05-4.25-3.7-4.38-3.87-.13-.17-1.05-1.4-1.05-2.66 0-1.27.67-1.89.9-2.15.22-.25.48-.31.64-.31.16 0 .32 0 .46.01.15.01.35-.06.55.42.22.53.73 1.83.79 1.96.06.13.1.29.02.46-.08.17-.13.28-.25.43-.13.15-.27.34-.38.46-.13.13-.26.27-.11.53.15.26.67 1.1 1.44 1.79.99.88 1.82 1.15 2.08 1.28.26.13.41.11.56-.07.15-.18.64-.75.81-1.01.17-.26.34-.21.56-.13.23.09 1.47.7 1.72.83.26.13.43.19.49.3.06.11.06.6-.16 1.22Z"/></svg>`
const ICON_CHEVRON_RIGHT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`
const ICON_CHAT_BUBBLE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.62 1.32 4.96 3.4 6.57-.11 1.2-.5 2.44-1.28 3.5a.5.5 0 0 0 .5.77c1.9-.42 3.4-1.24 4.5-2.03.9.24 1.87.36 2.88.36 5.52 0 10-3.94 10-8.8S17.52 2 12 2Z"/></svg>`
const ICON_PLUS = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m3 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7"/></svg>`
const ICON_SEND = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.6 22 12 3.4 3.4 3 10l13 2-13 2z"/></svg>`

// Ícones das categorias (pílulas de filtro): o nome vem livre do restaurante
// (ver categoryStyle, abaixo), então o ícone é escolhido por palavra-chave,
// com um talher genérico como fallback pra qualquer categoria que não bata
// com nenhuma palavra conhecida.
const ICON_CAT_STARTER = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12a10 10 0 0 1 20 0Z"/><path d="M2 12h20M6 12V9M18 12V9"/></svg>`
const ICON_CAT_MAIN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v7a3 3 0 0 0 3 3v8M6 3v7M9 3v7M15 3c-1.5 1.5-2 3-2 5.5S15 13 15 13v8M15 3v18"/></svg>`
const ICON_CAT_DESSERT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-6a8 8 0 0 1 16 0v6"/><path d="M2 21h20M12 3v4M9 4.5 12 7l3-2.5"/></svg>`
const ICON_CAT_DRINK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l-1.5 15.5a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6 3Z"/><path d="M5 8h14"/></svg>`

// Ícone do bloco de destaques (products.destaque, migration 0011) — um
// "sparkle" simples, sem emoji, no mesmo estilo dos outros ícones da página.
const ICON_SPARKLE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/></svg>`

// Palavra-chave no nome da categoria (livre, cadastrado pelo restaurante) →
// ícone + frase de efeito da seção. Cobre os nomes mais comuns; qualquer
// outro nome cai no fallback genérico, sem quebrar nada.
function categoryStyle(name, iconKey) {
  const style = categoryKeywordStyle(name)
  // Ícone escolhido pelo dono no painel (categories.icon) vence o automático.
  return { ...style, icon: categoryIconSvg(iconKey) || style.icon }
}

function categoryKeywordStyle(name) {
  const n = name.toLowerCase()
  if (n.includes('entrada') || n.includes('starter'))
    return { icon: ICON_CAT_STARTER, tagline: 'Comece sua experiência com muito sabor.' }
  if (n.includes('sobremesa') || n.includes('doce') || n.includes('dessert'))
    return { icon: ICON_CAT_DESSERT, tagline: 'Um docinho pra fechar com chave de ouro.' }
  if (n.includes('bebida') || n.includes('suco') || n.includes('drink') || n.includes('álcool') || n.includes('alcool'))
    return { icon: ICON_CAT_DRINK, tagline: 'Pra acompanhar e refrescar.' }
  if (n.includes('principal') || n.includes('prato') || n.includes('main'))
    return { icon: ICON_CAT_MAIN, tagline: 'O prato certo pra matar a fome.' }
  return { icon: ICON_CAT_MAIN, tagline: 'Dá uma olhada nessas opções.' }
}

let restaurant = null
let products = []
let categories = []
// null = sem "?mesa=" na URL (fluxo antigo, balcão). 'not_found' = veio
// "?mesa=" mas não existe nenhuma mesa com esse número pra este
// restaurante. Objeto = mesa encontrada (checar .ativo antes de liberar o
// cardápio).
let mesaInfo = null
let cart = [] // { product, quantity, notes }
let cartOpen = false
let placing = false
let chatOpen = false
let chatMessages = []
let chatInput = ''
let chatLoading = false
let expandedProduct = null
let productNoteDraft = ''
// true quando o modal de detalhe foi aberto a partir de um mini-card do chat
// (ver bindPageEvents, data-mini-product) — fechar ou adicionar o produto
// nesse caso deve voltar pro chat, não pro cardápio por trás dele.
let returnToChatAfterDetail = false
// Balãozinho de dica perto do botão do Ari, só pra chamar atenção na
// primeira olhada no cardápio — some sozinho depois de um tempo, ou assim
// que o cliente interage com o chat/carrinho/detalhe de produto.
let chatHintVisible = true
let chatHintTimeoutId = null

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

// Identificação do cliente (só o primeiro nome, opcional), pedida uma vez na
// tela de boas-vindas antes do cardápio. Guardada no navegador (localStorage)
// pra não precisar perguntar de novo numa próxima visita no mesmo aparelho.
// Sem telefone — o pedido agora pode ir direto pro WhatsApp do restaurante
// (ver placeOrder/whatsappOrderLink), então não precisa mais coletar contato
// do cliente aqui.
let showWelcome = true
let customerName = ''
let welcomeNameDraft = ''

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

// ---- Identidade do cliente (primeiro nome, opcional) ----

// Conta uma abertura do cardápio (tabela menu_events, migration 0017) pra aba
// "Análise" do portal mestre. Uma vez por SESSÃO do navegador (recarregar a
// página não conta de novo) e com um id de visitante aleatório guardado no
// aparelho, só pra contar visitantes únicos — nenhum dado pessoal. Falha em
// silêncio: métrica nunca pode atrapalhar o cliente. O insert não usa
// .select() de propósito (RETURNING exigiria policy de leitura).
function trackMenuOpen() {
  try {
    const sessionKey = `papeiai_opened_${restaurant.id}`
    if (sessionStorage.getItem(sessionKey)) return
    sessionStorage.setItem(sessionKey, '1')

    let visitorId = null
    try {
      visitorId = localStorage.getItem('papeiai_visitor')
      if (!visitorId) {
        visitorId = crypto.randomUUID()
        localStorage.setItem('papeiai_visitor', visitorId)
      }
    } catch {
      visitorId = crypto.randomUUID() // storage bloqueado: conta como visitante novo
    }

    supabaseClient
      .from('menu_events')
      .insert({ restaurant_id: restaurant.id, event_type: 'menu_open', visitor_id: visitorId, mesa: numero || null })
      .then(({ error }) => {
        if (error) console.warn('menu_events:', error.message)
      })
  } catch {
    // sem sessionStorage etc.: simplesmente não conta
  }
}

function loadStoredCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.name === 'string') return parsed
  } catch {
    // localStorage indisponível (modo privado, storage bloqueado etc.) — cai
    // no fluxo normal de pedir os dados de novo, sem quebrar a página.
  }
  return null
}

function saveCustomer(name) {
  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({ name }))
  } catch {
    // Sem storage disponível: segue o pedido normalmente, só não vai lembrar
    // na próxima visita.
  }
}

function isValidName(name) {
  return name.trim().length >= 2
}

// Nome é opcional: vazio passa direto; só barra 1 caractere avulso (evita
// salvar "lixo" de toque sem querer no campo).
function isWelcomeValid() {
  return welcomeNameDraft.trim().length === 0 || isValidName(welcomeNameDraft)
}

function buildInitialChatMessage() {
  const greeting = customerName ? `, ${customerName}` : ''
  return `Oi${greeting}! Eu sou o Ari, garçom do ${restaurant.name}. O que você tá com vontade de comer hoje?`
}

// ---- Card de apresentação do Ari (acima das categorias) ----
// Diferente do balão de dica (temporário, some sozinho), este card fica fixo
// no topo do cardápio — é a primeira explicação de quem é o Ari e pra que
// serve, antes mesmo do cliente olhar os pratos.
function ariIntroHtml() {
  return `
    <div id="ari-intro" class="fade-slide-in bg-surface-card border border-surface-line rounded-2xl p-3 sm:p-4 flex items-center gap-3">
      ${chatAvatarHtml('w-12 h-12 sm:w-14 sm:h-14 ring-2 ring-brand-orange/40 shrink-0')}
      <div class="min-w-0">
        <h2 class="text-ink font-bold text-sm sm:text-base leading-snug">Sou o <span class="text-brand-orange">Ari</span>, seu garçom</h2>
        <p class="text-neutral-400 text-[11px] sm:text-xs mt-0.5 leading-relaxed">Peça sugestões, tire dúvidas ou monte seu pedido — é só chamar.</p>
        <button id="ari-intro-btn" class="mt-2 inline-flex items-center gap-1.5 bg-brand-orange text-white text-[11px] sm:text-xs font-semibold rounded-full pl-3 pr-2.5 py-1.5 shadow-brand-ai hover:opacity-90 active:scale-[0.98] transition [&>svg]:w-3.5 [&>svg]:h-3.5">
          ${ICON_CHAT_BUBBLE}
          Conversar com o Ari
          ${ICON_CHEVRON_RIGHT}
        </button>
      </div>
    </div>
  `
}

// ---- Balão de dica do Ari (chama atenção pro chat na primeira olhada) ----

function chatHintHtml() {
  return `
    <div
      id="chat-hint"
      class="fade-slide-in fixed right-3 z-10 max-w-[13rem] bg-surface-card border border-surface-line rounded-2xl rounded-br-md shadow-xl pl-3.5 pr-7 py-2.5 cursor-pointer"
      style="bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));"
    >
      <button id="chat-hint-close" title="Fechar" class="absolute top-1 right-1 text-neutral-500 hover:text-neutral-300 transition w-5 h-5 flex items-center justify-center text-xs leading-none">✕</button>
      <p class="font-semibold text-xs text-brand-orange">Fale com o Ari</p>
      <p class="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">Posso te ajudar a escolher algo delicioso!</p>
    </div>
  `
}

// Some sozinho depois de um tempo — chamado só quando a tela do cardápio de
// fato aparece (depois da tela de boas-vindas, se houver uma).
function startChatHintTimer() {
  if (chatHintTimeoutId !== null || !chatHintVisible) return
  chatHintTimeoutId = setTimeout(() => {
    chatHintTimeoutId = null
    dismissChatHint()
  }, 6000)
}

function dismissChatHint() {
  if (chatHintTimeoutId !== null) {
    clearTimeout(chatHintTimeoutId)
    chatHintTimeoutId = null
  }
  if (!chatHintVisible) return
  chatHintVisible = false
  renderPage()
}

function mesaUnavailableHtml() {
  return `
    <div class="min-h-[100dvh] flex items-center justify-center text-center px-6 bg-surface">
      <div class="max-w-sm">
        ${renderLogo({ size: 'md' })}
        <p class="text-ink font-semibold mt-4">Esta mesa está temporariamente indisponível.</p>
        <p class="text-neutral-400 text-sm mt-1">Chame um atendente.</p>
      </div>
    </div>
  `
}

// Versões escuras de loadingHtml()/notFoundHtml() (js/util.js) — aquelas são
// compartilhadas com admin/ e restaurante/ (tema claro), então em vez de
// escurecer o helper pra todo mundo, o cardápio usa sua própria versão só
// pra essas duas telas iniciais (antes de saber se o restaurante existe).
function cardapioLoadingHtml() {
  return `<div class="min-h-[100dvh] bg-surface flex items-center justify-center text-neutral-400">Carregando...</div>`
}

function cardapioNotFoundHtml(message) {
  return `
    <div class="min-h-[100dvh] bg-surface flex items-center justify-center text-center px-4">
      <div>
        ${renderLogo({ size: 'md' })}
        <p class="text-neutral-400 mt-4">${escapeHtml(message)}</p>
      </div>
    </div>
  `
}

async function init() {
  if (!slug) {
    root.innerHTML = cardapioNotFoundHtml('Restaurante não encontrado.')
    return
  }

  root.innerHTML = cardapioLoadingHtml()

  const { data } = await supabaseClient
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  restaurant = data || 'not_found'

  if (restaurant === 'not_found') {
    root.innerHTML = cardapioNotFoundHtml('Restaurante não encontrado.')
    return
  }

  // Antes de qualquer render: aplica a cor de destaque cadastrada pelo
  // restaurante (ver js/util.js) pra já pintar certo desde a primeira tela,
  // sem flash do laranja padrão trocando pra cor escolhida.
  applyThemeColor(restaurant.theme_color)

  // Se o QR Code trouxe uma mesa (?mesa=N, gerado pelo admin — ver
  // admin/mesas-print.html), confirma que ela existe e está ativa antes de
  // liberar o resto da página. Sem isso, uma mesa quebrada/removida do salão
  // continuaria aceitando pedido só porque o QR Code impresso ainda existe.
  if (numero) {
    const { data: mesaData } = await supabaseClient
      .from('mesas')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('numero', numero)
      .maybeSingle()
    mesaInfo = mesaData || 'not_found'

    if (mesaInfo === 'not_found' || !mesaInfo.ativo) {
      root.innerHTML = mesaUnavailableHtml()
      return
    }
  }

  trackMenuOpen()

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
    showWelcome = false
    chatMessages = [{ role: 'assistant', content: buildInitialChatMessage() }]
  }

  renderPage()
  if (!showWelcome) startChatHintTimer()
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
    <div class="relative min-h-[100dvh] overflow-hidden bg-surface flex flex-col">
      <div class="absolute -top-28 -left-24 w-72 h-72 rounded-full bg-brand-blue/20 blur-3xl" aria-hidden="true"></div>
      <div class="absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-brand-orange/20 blur-3xl" aria-hidden="true"></div>

      ${themeToggleHtml('absolute top-3 right-3 z-10 !w-8 !h-8')}
      <div class="relative flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div class="w-full max-w-sm fade-slide-in">
          <div class="flex justify-center">${renderLogo({ size: 'md' })}</div>

          <div class="text-center mt-7">
            <div class="relative w-28 h-28 mx-auto">
              <div class="absolute inset-0 rounded-full bg-gradient-to-br from-brand-orange to-brand-red blur-xl opacity-40"></div>
              <div class="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-surface shadow-xl bg-brand-orange/20">
                <img
                  src="${CHAT_AVATAR_URL}"
                  alt="Ari"
                  class="w-full h-full object-cover"
                  style="object-position: 50% 12%; transform: scale(1.55); transform-origin: 50% 15%;"
                />
              </div>
            </div>
            <h1 class="text-2xl font-bold text-ink mt-4">Oi, eu sou o Ari</h1>
            <p class="text-sm text-neutral-400 mt-2 leading-relaxed px-2">
              Seu garçom pessoal no ${escapeHtml(restaurant.name)}. Vou te ajudar a escolher os
              pratos e montar o pedido, tudo por aqui.
            </p>
          </div>

          <form id="welcome-form" class="bg-surface-card border border-surface-line rounded-2xl shadow-xl p-6 space-y-3.5 mt-7">
            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">${ICON_PERSON}</span>
              <input
                id="welcome-name"
                value="${escapeHtml(welcomeNameDraft)}"
                placeholder="Seu primeiro nome (opcional)"
                aria-label="Primeiro nome (opcional)"
                autocomplete="given-name"
                autofocus
                class="w-full bg-surface-raised border border-surface-line text-ink placeholder-neutral-500 rounded-xl pl-10 pr-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-orange transition"
              />
            </div>
            <button
              type="submit"
              id="welcome-submit"
              ${isWelcomeValid() ? '' : 'disabled'}
              class="w-full bg-gradient-to-r from-brand-orange to-brand-red text-white font-semibold rounded-xl py-3.5 shadow-brand-ai hover:opacity-90 active:scale-[0.99] transition disabled:opacity-40"
            >
              Iniciar
            </button>
          </form>
        </div>
      </div>
    </div>
  `
}

function bindWelcomeEvents() {
  document.getElementById('welcome-name').addEventListener('input', (e) => {
    welcomeNameDraft = e.target.value
    updateWelcomeSubmitState()
  })

  document.getElementById('welcome-form').addEventListener('submit', (e) => {
    e.preventDefault()
    if (!isWelcomeValid()) return
    customerName = welcomeNameDraft.trim()
    saveCustomer(customerName)
    chatMessages = [{ role: 'assistant', content: buildInitialChatMessage() }]
    showWelcome = false
    renderPage()
    startChatHintTimer()
  })
}

function updateWelcomeSubmitState() {
  const btn = document.getElementById('welcome-submit')
  if (btn) btn.disabled = !isWelcomeValid()
}

// ---- Cardápio ----

function pageHtml() {
  return `
    <div class="min-h-[100dvh] bg-surface pb-32">
      <!-- Header: saudação + nome do restaurante (e logo, se tiver) à
           esquerda, mesa (se veio pela URL) discreta à direita. Sem barra de
           navegação inferior — o app não tem abas. -->
      <header class="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-surface-line">
        <div class="max-w-2xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            ${
              restaurant.logo_url
                ? `<img src="${escapeHtml(restaurant.logo_url)}" alt="${escapeHtml(restaurant.name)}" class="w-9 h-9 rounded-full object-cover border border-surface-line shrink-0" />`
                : ''
            }
            <div class="min-w-0">
              <p class="text-[11px] text-neutral-400 leading-tight">Oi${customerName ? `, ${escapeHtml(customerName)}` : ''}!</p>
              <h1 class="text-sm font-extrabold text-ink leading-tight truncate">${escapeHtml(restaurant.name)}</h1>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${
              numero
                ? `<span class="text-[10px] font-semibold text-neutral-300 bg-surface-card border border-surface-line rounded-full px-2.5 py-1">Mesa ${escapeHtml(numero)}</span>`
                : ''
            }
            ${themeToggleHtml('!w-8 !h-8')}
          </div>
        </div>
      </header>

      <main class="max-w-2xl mx-auto px-3 py-4 sm:px-6 sm:py-5 space-y-4">
        ${ariIntroHtml()}
        ${menuContentHtml()}
      </main>

      <footer class="max-w-2xl mx-auto px-4 pb-4 -mt-2 flex items-center justify-center">
        <a href="${escapeHtml(landingUrl())}" target="_blank" rel="noreferrer" class="text-xs text-neutral-500 underline hover:text-neutral-300 transition">PapeiAI</a>
      </footer>

      <!-- Botão flutuante do Ari — avatar redondo com um brilho suave atrás
           (glow) e um selinho de chat no canto, em vez de tentar forçar uma
           forma geométrica chamativa: mais simples, mais limpo, sem parte
           nenhuma "flutuando" sem apoio visual. -->
      <div
        class="fixed right-3 z-30 ${chatOpen || expandedProduct || cartOpen ? 'hidden' : ''}"
        style="bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
      >
        <span class="absolute inset-0 rounded-full bg-brand-orange/45 blur-xl scale-125" aria-hidden="true"></span>
        <button
          id="chat-fab"
          title="Falar com o Ari"
          aria-label="Falar com o Ari"
          class="relative block rounded-full ring-4 ring-brand-orange/25 shadow-brand-ai hover:scale-105 active:scale-95 transition"
        >
          ${chatAvatarHtml('w-12 h-12 ring-2 ring-white')}
          <span class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-orange text-white flex items-center justify-center ring-2 ring-surface shadow-sm [&>svg]:w-3 [&>svg]:h-3">
            ${ICON_CHAT_BUBBLE}
          </span>
        </button>
      </div>

      ${chatHintVisible && !chatOpen && !expandedProduct && !cartOpen ? chatHintHtml() : ''}

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
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, items: products.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.items.length > 0)
  const uncategorized = products.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id))
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Outros', items: uncategorized })
  return groups
}

function menuContentHtml() {
  if (products.length === 0) {
    return emptyStateHtml('🍽️', 'Cardápio ainda não tem itens disponíveis. Volte daqui a pouco!')
  }

  const destaqueHtml = destaqueSectionHtml()
  const groups = buildMenuGroups()
  if (!groups) {
    return `${destaqueHtml}<div class="grid grid-cols-3 gap-2">${products.map((p) => productCardHtml(p)).join('')}</div>`
  }

  return `${destaqueHtml}${categoryNavHtml(groups)}${groups.map(menuSectionHtml).join('')}`
}

// Bloco "Destaques da casa" — produtos marcados pelo restaurante (máx. 3, ver
// restaurante/painel.js) num carrossel de cards maiores, acima das
// categorias. Some por completo (retorna string vazia, sem deixar espaço
// reservado) quando o restaurante não tem nenhum destaque cadastrado.
function destaqueSectionHtml() {
  const destaques = products.filter((p) => p.destaque)
  if (destaques.length === 0) return ''
  return `
    <section class="space-y-2.5">
      <div class="flex items-center gap-1.5">
        <span class="text-brand-orange [&>svg]:w-4 [&>svg]:h-4">${ICON_SPARKLE}</span>
        <h2 class="text-sm font-bold text-ink">Destaques da casa</h2>
      </div>
      <div class="flex gap-2.5 overflow-x-auto scroll-contain -mx-3 px-3 sm:-mx-6 sm:px-6 pb-1">
        ${destaques.map(destaqueCardHtml).join('')}
      </div>
    </section>
  `
}

// Card maior que o do grid normal (productCardHtml): imagem em destaque,
// nome, descrição curta e preço. Mesmo modal de detalhe ao tocar (data-expand
// já é tratado por bindPageEvents, junto com os cards normais).
function destaqueCardHtml(p) {
  return `
    <div data-expand="${p.id}" class="fade-slide-in shrink-0 w-40 bg-surface-card border border-surface-line rounded-xl overflow-hidden cursor-pointer active:opacity-90 transition">
      <div class="relative aspect-[4/3] w-full bg-surface-raised">
        ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" class="w-full h-full object-cover" />` : ''}
        <button data-add="${p.id}" title="Adicionar" class="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-lg ring-1 ring-surface-card active:scale-90 transition">${ICON_PLUS}</button>
      </div>
      <div class="p-2.5">
        <p class="text-xs font-semibold text-ink leading-snug line-clamp-1">${escapeHtml(p.name)}</p>
        ${p.description ? `<p class="text-[10px] text-neutral-400 line-clamp-2 mt-0.5 leading-snug">${escapeHtml(p.description)}</p>` : ''}
        <p class="text-brand-orange font-bold text-xs mt-1">R$ ${formatBRL(p.price)}</p>
      </div>
    </div>
  `
}

// Chips circulares pra pular direto pra uma seção — só compensa mostrar
// quando há mais de uma seção; com uma só, seria repetir o título à toa. A
// pílula tocada muda de estilo via JS (ver bindPageEvents, data-pill-circle/
// data-pill-label), não por re-render — o scroll até a seção já acontece
// sozinho, é o comportamento nativo do navegador pra link com "#âncora".
function categoryNavHtml(groups) {
  if (groups.length <= 1) return ''
  return `
    <nav id="category-nav" class="scroll-contain sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2.5 bg-surface/95 backdrop-blur border-b border-surface-line overflow-x-auto">
      <div class="flex gap-3 w-max">
        ${groups
          .map(
            (g, idx) => `
          <a href="#secao-${g.id || 'outros'}" data-category-pill class="flex flex-col items-center gap-1 w-12 shrink-0">
            <span data-pill-circle class="w-10 h-10 rounded-full flex items-center justify-center transition [&>svg]:w-4 [&>svg]:h-4 ${
              idx === 0
                ? 'bg-brand-orange text-white'
                : 'bg-surface-card border border-surface-line text-neutral-400'
            }">${categoryStyle(g.name, g.icon).icon}</span>
            <span data-pill-label class="text-[9px] font-medium text-center leading-tight truncate w-full ${
              idx === 0 ? 'text-ink' : 'text-neutral-400'
            }">${escapeHtml(g.name)}</span>
          </a>`
          )
          .join('')}
      </div>
    </nav>
  `
}

function menuSectionHtml(g) {
  const { tagline } = categoryStyle(g.name, g.icon)
  return `
    <section id="secao-${g.id || 'outros'}" class="space-y-2.5 scroll-mt-16">
      <div>
        <div class="flex items-center gap-1.5">
          <span class="w-1 h-4 rounded-full bg-brand-orange shrink-0"></span>
          <h2 class="text-sm font-bold text-ink">${escapeHtml(g.name)}</h2>
        </div>
        <p class="text-xs text-neutral-400 mt-0.5 ml-2.5">${tagline}</p>
      </div>
      <div class="grid grid-cols-3 gap-2">${g.items.map((p) => productCardHtml(p)).join('')}</div>
    </section>
  `
}

// Miniatura pequena e quadrada usada na linha do carrinho e no mini-card de
// recomendação do chat (ver cartItemRowHtml/productMiniCardHtml) — o card do
// cardápio em si não usa isso mais, tem a própria imagem em destaque (ver
// productCardHtml). Produto sem foto não reserva nenhum espaço de imagem
// (sem placeholder cinza) — a linha/card se reorganiza sozinho porque o flex
// simplesmente fica com um filho a menos.
function productImageHtml(p) {
  if (!p.image_url) return ''
  return `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-14 h-14 rounded-lg object-cover shrink-0" />`
}

// Card do cardápio: com foto, a imagem ocupa o topo todo (quadrada) com o
// botão "+" circular sobre o canto dela; sem foto, vira um cartão compacto
// (só texto) do mesmo tamanho de grade, com o "+" no canto do próprio
// cartão — a variação que o "ou" do briefing previu ("+ no canto inferior
// direito da imagem, ou do card"). Nenhum dos dois usa productImageHtml():
// aquele helper é só pra miniatura pequena (carrinho/mini-card do chat).
function productCardHtml(p) {
  if (p.image_url) {
    return `
      <div data-expand="${p.id}" class="fade-slide-in bg-surface-card border border-surface-line rounded-xl overflow-hidden cursor-pointer active:opacity-90 transition">
        <div class="relative aspect-square w-full bg-surface-raised">
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" class="w-full h-full object-cover" />
          <button data-add="${p.id}" title="Adicionar" class="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-lg ring-1 ring-surface-card active:scale-90 transition">${ICON_PLUS}</button>
        </div>
        <div class="p-2">
          <p class="text-[11px] font-semibold text-ink leading-snug line-clamp-1">${escapeHtml(p.name)}</p>
          <p class="text-brand-orange font-bold text-[11px] mt-0.5">R$ ${formatBRL(p.price)}</p>
        </div>
      </div>
    `
  }
  return `
    <div data-expand="${p.id}" class="fade-slide-in bg-surface-card border border-surface-line rounded-xl p-2.5 flex flex-col justify-between min-h-[5.5rem] cursor-pointer active:opacity-90 transition">
      <div>
        <p class="text-[11px] font-semibold text-ink leading-snug line-clamp-2">${escapeHtml(p.name)}</p>
        ${p.description ? `<p class="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">${escapeHtml(p.description)}</p>` : ''}
      </div>
      <div class="flex items-center justify-between mt-1.5 gap-1">
        <span class="text-brand-orange font-bold text-[11px] truncate">R$ ${formatBRL(p.price)}</span>
        <button data-add="${p.id}" title="Adicionar" class="w-6 h-6 rounded-full bg-brand-orange text-white flex items-center justify-center shadow active:scale-90 transition shrink-0">${ICON_PLUS}</button>
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
    <div id="detail-overlay" class="modal-overlay fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div id="detail-box" class="modal-box bg-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto scroll-contain safe-bottom border border-surface-line">
        <div class="relative">
          ${
            p.image_url
              ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-full h-44 sm:h-52 object-cover" />`
              : ''
          }
          <button id="detail-close" title="Fechar" class="absolute top-3 right-3 z-10 bg-surface-card/90 hover:bg-surface-card text-ink rounded-full w-9 h-9 flex items-center justify-center shadow transition">✕</button>
        </div>
        <div class="p-5 ${p.image_url ? '' : 'pt-10'} space-y-3">
          <div>
            <h3 class="text-lg font-bold text-ink leading-snug">${escapeHtml(p.name)}</h3>
            <p class="text-brand-orange font-semibold mt-0.5">R$ ${formatBRL(p.price)}</p>
          </div>
          ${p.description ? `<p class="text-sm text-neutral-400 leading-relaxed">${escapeHtml(p.description)}</p>` : ''}
          ${
            p.ingredients && p.ingredients.length > 0
              ? `
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Ingredientes</p>
              <div class="flex flex-wrap gap-1.5">
                ${p.ingredients.map((i) => `<span class="text-xs bg-surface-card border border-surface-line text-neutral-300 rounded-full px-2.5 py-1">${escapeHtml(i)}</span>`).join('')}
              </div>
            </div>
          `
              : ''
          }
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="pf-note" class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Observações</label>
              <span id="note-counter" class="text-xs text-neutral-500">${productNoteDraft.length}/140</span>
            </div>
            <textarea
              id="pf-note"
              rows="2"
              maxlength="140"
              placeholder="Ex: sem cebola, ponto da carne, tirar o queijo…"
              class="w-full bg-surface-card border border-surface-line text-ink placeholder-neutral-500 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-orange transition resize-none"
            >${escapeHtml(productNoteDraft)}</textarea>
          </div>
          <button id="detail-save-btn" class="w-full bg-brand-orange text-white font-semibold rounded-lg py-3 shadow-brand-ai hover:opacity-90 active:scale-[0.99] transition mt-1">
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
      class="fixed bottom-0 left-0 right-0 bg-brand-orange text-white shadow-[0_-4px_16px_rgba(0,0,0,0.35)] border-t border-white/10 safe-bottom transition active:opacity-90 ${
        chatOpen || expandedProduct ? 'hidden' : ''
      } ${cartJustUpdated ? 'cart-pulse' : ''}"
    >
      <div class="max-w-2xl mx-auto px-3.5 py-3 flex items-center justify-between gap-3">
        <span class="flex items-center gap-2.5 font-semibold text-xs [&>span>svg]:w-[18px] [&>span>svg]:h-[18px]">
          <span class="relative shrink-0">
            ${ICON_CART}
            <span class="absolute -top-2 -right-2 bg-white text-brand-orange text-[9px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center leading-none ${cartJustUpdated ? 'badge-bump' : ''}">${count}</span>
          </span>
          Ver carrinho
        </span>
        <span class="flex items-center gap-1 font-bold text-sm [&>svg]:w-3.5 [&>svg]:h-3.5">
          R$ ${formatBRL(total)}
          ${ICON_CHEVRON_RIGHT}
        </span>
      </div>
    </button>
  `
}

function cartItemRowHtml(i) {
  const lineTotal = i.product.price * i.quantity
  const highlight = recentlyChangedProductIds.has(i.product.id) ? 'row-highlight' : ''
  return `
    <div class="fade-slide-in flex gap-3 pb-3 border-b border-surface-line last:border-b-0 last:pb-0 rounded-lg px-1 -mx-1 ${highlight}">
      ${productImageHtml(i.product)}
      <div class="flex-1 min-w-0">
        <div data-edit-item="${i.product.id}" class="cursor-pointer">
          <div class="flex items-start justify-between gap-2">
            <p class="font-medium text-sm text-ink leading-snug">${escapeHtml(i.product.name)}</p>
            <button data-remove="${i.product.id}" title="Remover item" class="text-neutral-500 hover:text-brand-red transition shrink-0 w-9 h-9 -mt-1.5 -mr-1.5 flex items-center justify-center">${ICON_TRASH}</button>
          </div>
          <p class="text-xs text-neutral-500">R$ ${formatBRL(i.product.price)} cada</p>
          ${i.notes ? `<p class="text-xs text-neutral-400 italic mt-0.5">"${escapeHtml(i.notes)}"</p>` : ''}
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex items-center gap-2">
            <button data-dec="${i.product.id}" class="qty-btn w-9 h-9 text-base text-ink bg-surface-raised hover:bg-ink/10 rounded-lg">−</button>
            <span class="w-5 text-center text-sm text-ink tabular-nums">${i.quantity}</span>
            <button data-inc="${i.product.id}" class="qty-btn w-9 h-9 text-base text-ink bg-surface-raised hover:bg-ink/10 rounded-lg">+</button>
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
    <div id="cart-overlay" class="modal-overlay fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div id="cart-box" class="modal-box bg-surface border border-surface-line rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85dvh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-surface-line shrink-0">
          <span class="inline-flex items-center gap-2 font-semibold text-ink">${ICON_CART}Seu carrinho</span>
          <button id="cart-close" title="Fechar" class="text-neutral-500 hover:text-neutral-300 transition text-xl leading-none w-9 h-9 flex items-center justify-center -mr-2">✕</button>
        </div>
        <div class="scroll-contain flex-1 overflow-y-auto px-4 py-3">
          ${itemsHtml}
        </div>
        ${
          cart.length > 0
            ? `
          <div class="safe-bottom border-t border-surface-line p-4 space-y-3 shrink-0">
            <div class="flex items-center justify-between">
              <span class="text-sm text-neutral-400">Subtotal</span>
              <span class="font-bold text-lg text-ink">R$ ${formatBRL(total)}</span>
            </div>
            <button id="place-order-btn" ${placing ? 'disabled' : ''} class="w-full bg-brand-red text-white font-semibold rounded-lg py-3 shadow-brand-ai hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50">
              ${placing ? 'Enviando...' : 'Finalizar pedido'}
            </button>
            ${
              restaurant.whatsapp
                ? `<button id="place-order-whatsapp-btn" ${placing ? 'disabled' : ''} class="w-full bg-emerald-600 text-white font-semibold rounded-lg py-3 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2">${ICON_WHATSAPP}Enviar pedido no WhatsApp</button>`
                : ''
            }
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
    <div id="chat-overlay" class="modal-overlay fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div id="chat-box" class="modal-box bg-surface border border-surface-line rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md h-[calc(var(--vvh,100dvh)*0.88)] sm:h-[34rem] flex flex-col overflow-hidden shadow-2xl">
        <div class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-orange to-brand-red text-white shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            ${chatAvatarHtml('w-10 h-10 ring-2 ring-white/25')}
            <div class="leading-tight min-w-0">
              <p class="font-semibold text-sm truncate">Ari</p>
              <p class="text-[11px] text-white/75 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Sempre disponível
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${
              cartCount > 0
                ? `<button id="chat-view-cart" title="Ver carrinho" class="relative bg-white/20 hover:bg-white/30 text-white transition w-11 h-11 flex items-center justify-center rounded-full shadow-sm">
                    ${ICON_CART}
                    <span class="absolute -top-1 -right-1 bg-white text-brand-red text-xs font-bold rounded-full min-w-[20px] h-[20px] px-1 flex items-center justify-center leading-none">${cartCount}</span>
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
                  <div class="bg-surface-card border border-surface-line text-neutral-400 rounded-2xl rounded-bl-md px-4 py-3"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>
                </div>`
              : ''
          }
        </div>
        ${chatSuggestionsHtml()}
        <form id="chat-form" class="safe-bottom flex gap-2 p-3 bg-surface border-t border-surface-line shrink-0">
          <input
            id="chat-input"
            value="${escapeHtml(chatInput)}"
            placeholder="${notingOrder ? 'Anotando seu pedido…' : 'Ex: algo vegetariano e picante'}"
            autocomplete="off"
            ${notingOrder ? 'disabled' : ''}
            class="flex-1 min-w-0 bg-surface-card border border-surface-line text-ink placeholder-neutral-500 rounded-full px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-orange transition disabled:opacity-50"
          />
          <button type="submit" ${chatLoading || notingOrder ? 'disabled' : ''} title="Enviar" class="bg-gradient-to-br from-brand-orange to-brand-red text-white rounded-full w-11 h-11 flex items-center justify-center shadow-brand-ai hover:opacity-90 active:scale-95 transition disabled:opacity-50 shrink-0">${ICON_SEND}</button>
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
    <div class="chip-scroll-fade scroll-contain shrink-0 px-3 py-2.5 flex gap-2 overflow-x-auto bg-surface border-t border-surface-line">
      ${suggestions
        .map(
          (s) =>
            `<button data-suggest="${escapeHtml(s)}" ${busy ? 'disabled' : ''} class="text-xs font-medium bg-surface-card border border-surface-line text-neutral-300 whitespace-nowrap rounded-full px-3.5 py-2 hover:border-brand-orange hover:text-brand-orange transition shrink-0 disabled:opacity-50">${escapeHtml(s)}</button>`
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
        <div class="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line bg-brand-orange text-white shadow-sm">${escapeHtml(m.content)}</div>
      </div>
    `
  }
  return `
    <div class="flex items-end gap-2 ${entrance}">
      ${chatAvatarHtml('w-7 h-7')}
      <div class="flex flex-col items-start gap-1.5 max-w-[80%] min-w-0">
        <div class="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line bg-surface-card text-neutral-200 border border-surface-line">${escapeHtml(m.content)}</div>
        ${m.actionCards && m.actionCards.length > 0 ? actionCardsHtml(m.actionCards, isNew) : ''}
        ${m.recommendedProducts && m.recommendedProducts.length > 0 ? recommendedProductsHtml(m.recommendedProducts) : ''}
      </div>
    </div>
  `
}

// Mini-cards de produto recomendado pelo Ari (ver ai-waiter/index.ts,
// "produtos_recomendados") — foto (se tiver)/nome/preço, sem botão de
// adicionar: tocar em qualquer parte abre o mesmo modal de detalhe do
// produto usado no cardápio (openProductDetail), nunca adiciona direto.
function productMiniCardHtml(p) {
  return `
    <div data-mini-product="${p.id}" class="flex items-center gap-2.5 bg-surface border border-surface-line rounded-xl p-2 w-full cursor-pointer active:opacity-80 transition">
      ${productImageHtml(p)}
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-ink leading-snug truncate">${escapeHtml(p.name)}</p>
        <p class="text-xs font-semibold text-brand-orange mt-0.5">R$ ${formatBRL(p.price)}</p>
      </div>
      <span class="text-neutral-500 shrink-0" aria-hidden="true">›</span>
    </div>
  `
}

function recommendedProductsHtml(recommendedProducts) {
  return `
    <div class="flex flex-col gap-1.5 w-full">
      ${recommendedProducts.map(productMiniCardHtml).join('')}
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
    dismissChatHint()
    renderPage()
  })

  const ariIntroBtn = document.getElementById('ari-intro-btn')
  if (ariIntroBtn) {
    ariIntroBtn.addEventListener('click', () => {
      chatOpen = true
      dismissChatHint()
      renderPage()
    })
  }

  const chatHint = document.getElementById('chat-hint')
  if (chatHint) {
    chatHint.addEventListener('click', (e) => {
      if (e.target.closest('#chat-hint-close')) {
        dismissChatHint()
        return
      }
      chatOpen = true
      dismissChatHint()
    })
  }

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.getAttribute('data-add')))
  })

  // Pílula tocada vira a "ativa" (preenchida) e as outras voltam ao estado
  // neutro — só troca classes no DOM, sem re-render nem estado próprio: o
  // scroll até a seção já acontece sozinho, é o comportamento nativo do
  // navegador pra link com "#âncora".
  const categoryNav = document.getElementById('category-nav')
  if (categoryNav) {
    categoryNav.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-category-pill]')
      if (!pill) return
      categoryNav.querySelectorAll('[data-category-pill]').forEach((el) => {
        const circle = el.querySelector('[data-pill-circle]')
        const label = el.querySelector('[data-pill-label]')
        circle.classList.remove('bg-brand-orange', 'text-white')
        circle.classList.add('bg-surface-card', 'border', 'border-surface-line', 'text-neutral-400')
        label.classList.remove('text-ink')
        label.classList.add('text-neutral-400')
      })
      const activeCircle = pill.querySelector('[data-pill-circle]')
      const activeLabel = pill.querySelector('[data-pill-label]')
      activeCircle.classList.remove('bg-surface-card', 'border', 'border-surface-line', 'text-neutral-400')
      activeCircle.classList.add('bg-brand-orange', 'text-white')
      activeLabel.classList.remove('text-neutral-400')
      activeLabel.classList.add('text-ink')
    })
  }

  document.querySelectorAll('[data-expand]').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Clique no botão "Adicionar" (que fica dentro do card) não deve abrir
      // o detalhe — só o resto do card.
      if (e.target.closest('[data-add]')) return
      returnToChatAfterDetail = false
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
        returnToChatAfterDetail = false
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
  if (placeBtn) placeBtn.addEventListener('click', () => placeOrder(false))
  const placeWaBtn = document.getElementById('place-order-whatsapp-btn')
  if (placeWaBtn) {
    placeWaBtn.addEventListener('click', () => {
      // Abre a aba EM BRANCO já aqui, ainda dentro do clique — Safari/iOS (e
      // outros bloqueadores de pop-up) só permitem window.open() como reação
      // direta e síncrona a um gesto do usuário; como placeOrder() é async
      // (espera o insert no Supabase antes de saber o link do WhatsApp), abrir
      // depois do await quase sempre seria bloqueado silenciosamente. Só
      // navegamos essa aba pro link de verdade quando o pedido termina de
      // salvar (ver placeOrder).
      const waWindow = window.open('', '_blank')
      placeOrder(true, waWindow)
    })
  }

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

    // Mini-card de produto recomendado (ver recommendedProductsHtml): sem
    // botão de adicionar — tocar em qualquer parte fecha o chat e abre o
    // mesmo modal de detalhe do produto usado no cardápio, nunca adiciona
    // direto ao carrinho. Ao fechar (ou adicionar) o detalhe, volta pro chat
    // em vez de cair no cardápio por trás — ver returnToChatAfterDetail.
    document.querySelectorAll('[data-mini-product]').forEach((card) => {
      card.addEventListener('click', () => {
        const productId = card.getAttribute('data-mini-product')
        chatOpen = false
        returnToChatAfterDetail = true
        openProductDetail(productId)
      })
    })

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
  if (returnToChatAfterDetail) {
    returnToChatAfterDetail = false
    chatOpen = true
  }
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
  if (returnToChatAfterDetail) {
    returnToChatAfterDetail = false
    chatOpen = true
  }
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

// Texto do pedido formatado pra mandar no WhatsApp — mesma informação que já
// vai pro banco (itens, observação, mesa, subtotal), só em texto simples.
function buildWhatsAppOrderMessage(total) {
  const linhas = cart.map(
    (i) =>
      `${i.quantity}x ${i.product.name}${i.notes ? ` (${i.notes})` : ''} — R$ ${formatBRL(i.product.price * i.quantity)}`
  )
  const partes = [
    `Novo pedido — ${restaurant.name}`,
    numero ? `Mesa ${numero}` : null,
    customerName ? `Cliente: ${customerName}` : null,
    '',
    ...linhas,
    '',
    `Subtotal: R$ ${formatBRL(total)}`,
  ].filter((linha) => linha !== null)
  return partes.join('\n')
}

// Link "https://wa.me/<numero>?text=<mensagem>" com o pedido pronto pra
// enviar — null se o restaurante não tiver WhatsApp cadastrado
// (restaurants.whatsapp, migration 0013). O número é guardado só com DDD
// (10-11 dígitos, mesmo padrão de telefone usado no resto do app, sem +55) —
// o código do país é prefixado aqui, só na hora de montar o link.
function whatsappOrderLink(total) {
  const digits = (restaurant.whatsapp || '').replace(/\D/g, '')
  if (!digits) return null
  const phoneWithCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(buildWhatsAppOrderMessage(total))}`
}

async function placeOrder(viaWhatsApp, waWindow) {
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
      // Texto, não número: uma mesa pode ter sido renomeada pra um rótulo
      // livre no admin (ex: "8 — Varanda", ver admin/mesas-print.html) — o
      // pedido guarda esse rótulo exatamente como está (migration 0008
      // trocou orders.table_number de int pra text por causa disso).
      table_number: numero || null,
      total,
      customer_name: customerName || null,
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

    // "Enviar pedido no WhatsApp": o pedido é salvo no banco igual ao
    // "Finalizar pedido" normal (fica no histórico do restaurante), e além
    // disso abre o WhatsApp com o resumo já pronto pra enviar — o cliente só
    // confirma o envio lá. Calculado antes de limpar o carrinho, que precisa
    // dos itens ainda no estado.
    const waLink = viaWhatsApp ? whatsappOrderLink(total) : null

    placing = false
    cart = []
    cartOpen = false
    // Zera a conversa com o Ari junto com o carrinho: sem isso, o "historico"
    // mandado pra Edge Function (sendChatMessage) continuava com as trocas de
    // antes do pedido ("beleza, uma coxinha no carrinho!"), e o modelo achava
    // que os itens do pedido já finalizado ainda estavam no carrinho, mesmo
    // com o campo "carrinho" (agora vazio) dizendo o contrário — histórico de
    // chat pesa tanto quanto o estado atual pro modelo. Um pedido novo começa
    // com o carrinho e a conversa do zero.
    chatMessages = [{ role: 'assistant', content: 'Pedido enviado! Se quiser pedir mais alguma coisa, é só me chamar. 🙂' }]
    renderPage()
    showToast('Pedido enviado com sucesso!', 'success')
    // Navega a aba já aberta (ver bindPageEvents) pro link de verdade — não
    // abre uma aba nova aqui, que seria bloqueada por já não estar mais
    // "dentro" do clique original.
    if (waLink && waWindow) waWindow.location.href = waLink
    else if (waWindow) waWindow.close() // pediu WhatsApp mas o restaurante não tem número: fecha a aba em branco
  } catch (err) {
    placing = false
    renderPage()
    showToast('Erro ao enviar pedido: ' + errorMessage(err), 'error', 5000)
    if (waWindow) waWindow.close() // pedido falhou: não deixa a aba em branco perdida
  }
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
}

async function sendChatMessage(e) {
  e.preventDefault()
  const mensagem = chatInput.trim()
  if (!mensagem) return

  // Fecha o teclado ao enviar, pra sobrar mais tela pra ver a resposta (e os
  // cartões de ação) sem o teclado ocupando metade da tela no celular. Pra
  // digitar de novo, é só tocar no campo — não refocamos automaticamente.
  // assumeKeyboardClosed() evita o "pulo" visual de esperar o evento
  // assíncrono do teclado fechando de verdade (ver comentário na definição).
  const inputBeforeSend = document.getElementById('chat-input')
  if (inputBeforeSend) inputBeforeSend.blur()
  assumeKeyboardClosed()

  // Só os últimos turnos vão pro modelo — mantém o prompt (e o custo por
  // mensagem) limitado mesmo numa conversa longa.
  const historico = chatMessages.slice(-12).map((m) => ({ role: m.role, content: m.content }))
  chatMessages.push({ role: 'user', content: mensagem })
  chatInput = ''
  chatLoading = true
  renderPage()

  let respostaTexto
  let cards = []
  let recommendedProducts = []

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

    // Segunda validação independente da mesma família da de applyAiActions():
    // só vira mini-card o id que realmente existir no cardápio já carregado
    // (ver Segurança no README) — resolvido contra o array `products` local,
    // não confiando cegamente na lista que veio da Edge Function.
    const produtosRecomendadosIds = Array.isArray(data.produtos_recomendados) ? data.produtos_recomendados : []
    recommendedProducts = produtosRecomendadosIds
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)
  } catch {
    respostaTexto = 'Ops, tive um problema para responder. Tenta de novo?'
  }

  chatMessages.push({ role: 'assistant', content: respostaTexto, actionCards: cards, recommendedProducts })
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
    }, staggerMs)
  } else {
    renderPage()
  }
}

function scrollChatToBottom() {
  const el = document.getElementById('chat-messages')
  if (el) el.scrollTop = el.scrollHeight
}

// iOS Safari não encolhe `dvh` quando o teclado abre (ele só reflete a UI do
// navegador, não o teclado), e ainda por cima rola a página pra "levantar" o
// campo focado acima do teclado — isso desloca elementos `position: fixed`
// (como o modal do chat) junto, porque no iOS o `fixed` acaba se comportando
// relativo ao viewport de LAYOUT, que passa a ficar deslocado em relação à
// área realmente visível. window.visualViewport descreve exatamente essa
// área visível (altura e o deslocamento do topo, `offsetTop`); guardamos os
// dois em custom properties e o CSS usa elas pra "grudar" o modal na área
// visível de verdade, em vez de confiar só em dvh/fixed puro.
//
// "maior altura de viewport já vista" — usada só pra detectar teclado aberto
// (ver syncVisualViewport). Sobe sozinha se a tela ficar maior de verdade
// (ex: girar o celular), então uma rotação não fica marcada como "teclado".
let tallestViewportSeen = window.visualViewport ? window.visualViewport.height : window.innerHeight

function syncVisualViewport() {
  const vv = window.visualViewport
  const root = document.documentElement.style
  const currentHeight = vv ? vv.height : window.innerHeight
  root.setProperty('--vvh', `${currentHeight}px`)
  root.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`)

  if (currentHeight > tallestViewportSeen) tallestViewportSeen = currentHeight
  // Teclado aberto encolhe a área visível bem mais do que qualquer ajuste
  // normal de UI do navegador (barra de endereço etc, no máximo uns 100px) —
  // nesse caso o chat (ver chatModalHtml) usa 100% da área visível em vez
  // dos 88% padrão, pra aproveitar cada pixel enquanto o cliente digita, e
  // volta ao tamanho normal sozinho assim que o teclado fecha.
  const keyboardLikelyOpen = tallestViewportSeen - currentHeight > 150
  document.documentElement.classList.toggle('keyboard-open', keyboardLikelyOpen)
}
// Chamado quando NÓS mesmos fechamos o teclado programaticamente (ver
// sendChatMessage → blur()): assume o estado "fechado" na hora, em vez de
// esperar o evento assíncrono do visualViewport (que só chega depois que o
// teclado termina de animar, ~200-300ms depois). Sem isso, o renderPage()
// que roda logo após o blur() ainda desenha o chat no tamanho "teclado
// aberto", e ele só encolhe de volta pro tamanho normal um instante depois
// — o "pulo" rápido que dá a impressão de bug.
function assumeKeyboardClosed() {
  const root = document.documentElement.style
  root.setProperty('--vvh', `${tallestViewportSeen}px`)
  root.setProperty('--vv-top', '0px')
  document.documentElement.classList.remove('keyboard-open')
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncVisualViewport)
  window.visualViewport.addEventListener('scroll', syncVisualViewport)
}
syncVisualViewport()

init()
