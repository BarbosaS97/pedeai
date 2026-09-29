// analytics.js — aba "Análise" do portal mestre (admin/index.html).
//
// Relatório por restaurante pra controle interno: tokens da IA, aberturas do
// cardápio, produtos, categorias, mesas, pedidos e faturamento num período
// (filtro de datas), com detalhe diário e exportação em CSV.
//
// Os dados vêm da Edge Function admin-stats, que só responde com o token de
// sessão assinado que o admin-login devolve (guardado em sessionStorage). As
// métricas de tokens e aberturas só existem a partir de quando a migration
// 0017, o ai-waiter novo e o cardápio novo entraram no ar.
//
// Carregado ANTES de admin.js (que define `state`, `render`, `root`...): aqui
// dentro essas variáveis só são usadas dentro de funções, nunca no load.

const ADMIN_TOKEN_KEY = 'pedeai_admin_token'

const analytics = {
  loading: false,
  error: '',
  expired: false,
  data: null, // resposta do admin-stats
  preset: 7, // 1 | 7 | 14 | 30 | 90 | 'custom'
  from: '',
  to: '',
  sort: 'tokens',
  query: '',
  expanded: null, // id do restaurante com o detalhe aberto
}

const ANALYTICS_PRESETS = [
  { key: 1, label: 'Hoje' },
  { key: 7, label: '7 dias' },
  { key: 14, label: '14 dias' },
  { key: 30, label: '30 dias' },
  { key: 90, label: '90 dias' },
  { key: 'custom', label: 'Período…' },
]

const ANALYTICS_SORTS = [
  { key: 'tokens', label: 'Mais tokens' },
  { key: 'opens', label: 'Mais aberturas' },
  { key: 'messages', label: 'Mais mensagens IA' },
  { key: 'orders', label: 'Mais pedidos' },
  { key: 'revenue', label: 'Maior faturamento' },
  { key: 'products', label: 'Mais produtos' },
  { key: 'name', label: 'Nome (A–Z)' },
]

// ---------- helpers ----------

const fmtInt = (n) => Number(n || 0).toLocaleString('pt-BR')
const fmtCompact = (n) =>
  Number(n || 0) >= 10000
    ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : fmtInt(n)
const fmtMoney = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function localDateStr(d) {
  const p = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function shortDate(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function analyticsRange() {
  if (analytics.preset === 'custom') return { from: analytics.from, to: analytics.to }
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - (analytics.preset - 1))
  return { from: localDateStr(from), to: localDateStr(to) }
}

// Lista de datas 'YYYY-MM-DD' de from..to (inclusive), pra preencher os dias sem dado.
function dateRange(from, to) {
  const out = []
  const d = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (d <= end && out.length < 400) {
    out.push(localDateStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// ---------- dados ----------

async function loadAnalytics() {
  const { from, to } = analyticsRange()
  if (!from || !to || to < from) {
    analytics.error = 'Escolha um período válido (a data final não pode ser antes da inicial).'
    renderAnalytics()
    return
  }
  analytics.loading = true
  analytics.error = ''
  analytics.expired = false
  renderAnalytics()

  try {
    const anonKey = window.PEDEAI_CONFIG.SUPABASE_ANON_KEY
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/admin-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ token: sessionStorage.getItem(ADMIN_TOKEN_KEY) || '', from, to }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.ok) {
      analytics.data = data
    } else if (data.error === 'unauthorized') {
      analytics.expired = true
      analytics.error = 'Sua sessão de admin expirou (ela dura 8 horas). Saia e entre de novo para ver o relatório.'
    } else if (data.error === 'bad_range') {
      analytics.error = 'Período inválido (máximo de 1 ano).'
    } else {
      analytics.error = 'Não foi possível carregar o relatório agora. Confira se a migration 0017 e a função admin-stats foram publicadas.'
    }
  } catch {
    analytics.error = 'Sem conexão com o servidor. Tente de novo.'
  }
  analytics.loading = false
  renderAnalytics()
}

function analyticsRows() {
  const q = analytics.query.trim().toLowerCase()
  const rows = ((analytics.data && analytics.data.restaurants) || []).filter((r) => !q || r.name.toLowerCase().includes(q))
  const keyOf = {
    tokens: (r) => r.ai_total_tokens,
    opens: (r) => r.opens,
    messages: (r) => r.ai_messages,
    orders: (r) => r.orders,
    revenue: (r) => Number(r.revenue),
    products: (r) => r.products,
  }[analytics.sort]
  return rows.slice().sort((a, b) => (keyOf ? keyOf(b) - keyOf(a) || a.name.localeCompare(b.name, 'pt-BR') : a.name.localeCompare(b.name, 'pt-BR')))
}

// ---------- HTML ----------

function adminTabsHtml() {
  const tab = (key, label) =>
    `<button type="button" data-admin-view="${key}" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${
      state.view === key ? 'bg-brand-blue text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'
    }">${label}</button>`
  return `<nav class="flex gap-1 bg-white border border-neutral-200 rounded-xl p-1 w-fit" aria-label="Seções do portal">${tab('restaurants', 'Restaurantes')}${tab('analytics', 'Análise')}</nav>`
}

function analyticsViewHtml() {
  return `<div id="analytics-root" class="space-y-4 sm:space-y-6">
    <div id="a-controls">${analyticsControlsHtml()}</div>
    <div id="a-results" class="space-y-4 sm:space-y-6">${analyticsResultsHtml()}</div>
  </div>`
}

function analyticsControlsHtml() {
  const chips = ANALYTICS_PRESETS.map(
    (p) =>
      `<button type="button" data-apreset="${p.key}" class="shrink-0 text-sm font-medium rounded-full px-3.5 py-1.5 border transition ${
        String(analytics.preset) === String(p.key)
          ? 'bg-brand-blue text-white border-brand-blue'
          : 'bg-white text-neutral-600 border-neutral-300 hover:border-brand-blue hover:text-brand-blue'
      }">${p.label}</button>`
  ).join('')
  const { from, to } = analyticsRange()
  const custom =
    analytics.preset === 'custom'
      ? `<div class="flex flex-wrap items-end gap-2">
          <label class="text-xs text-neutral-500">De<input id="a-from" type="date" value="${escapeHtml(analytics.from)}" max="${localDateStr(new Date())}" class="mt-1 block border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" /></label>
          <label class="text-xs text-neutral-500">Até<input id="a-to" type="date" value="${escapeHtml(analytics.to)}" max="${localDateStr(new Date())}" class="mt-1 block border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" /></label>
          <button type="button" data-aapply class="bg-brand-blue text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90 transition">Aplicar</button>
        </div>`
      : ''
  return `
    <section class="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4 sm:p-6 space-y-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 class="font-semibold text-lg">Análise por restaurante</h2>
          <p class="text-xs text-neutral-400 mt-0.5">Período: ${shortDate(from || '0000-00-00')} a ${shortDate(to || '0000-00-00')} · tokens e aberturas contam a partir da publicação da coleta</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" data-arefresh class="text-xs text-brand-blue hover:bg-brand-blue/10 transition rounded-lg px-2.5 py-2">Atualizar</button>
          <button type="button" data-aexport class="text-xs font-medium text-neutral-600 border border-neutral-300 hover:border-brand-blue hover:text-brand-blue transition rounded-lg px-3 py-2">Exportar CSV</button>
        </div>
      </div>
      <div class="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto scroll-contain pb-1">${chips}</div>
      ${custom}
      <div class="flex flex-col sm:flex-row gap-2">
        <input id="a-search" type="search" value="${escapeHtml(analytics.query)}" placeholder="Buscar restaurante..." class="flex-1 min-w-0 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue transition" />
        <select id="a-sort" class="sm:w-52 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue transition">
          ${ANALYTICS_SORTS.map((s) => `<option value="${s.key}" ${analytics.sort === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
    </section>
  `
}

function summaryCardHtml(label, value, sub, tone = 'text-neutral-900') {
  return `<div class="bg-white rounded-2xl border border-neutral-200 p-4">
    <p class="text-xs text-neutral-400 font-medium">${label}</p>
    <p class="text-2xl sm:text-3xl font-bold ${tone} mt-1">${value}</p>
    <p class="text-[11px] text-neutral-400 mt-0.5">${sub}</p>
  </div>`
}

function analyticsResultsHtml() {
  if (analytics.loading && !analytics.data) return skeletonCardsHtml(3)
  if (analytics.error) {
    return `<div class="bg-white rounded-2xl border border-neutral-200 p-6 text-center space-y-2">
      <p class="text-sm text-brand-red">⚠️ ${escapeHtml(analytics.error)}</p>
      ${analytics.expired ? '' : '<button type="button" data-arefresh class="text-sm text-brand-blue hover:underline">Tentar de novo</button>'}
    </div>`
  }
  if (!analytics.data) return ''

  const all = analytics.data.restaurants
  const sum = (k) => all.reduce((acc, r) => acc + Number(r[k] || 0), 0)
  const msgs = sum('ai_messages')
  const tokens = sum('ai_total_tokens')
  const rows = analyticsRows()

  const cards = `
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 ${analytics.loading ? 'opacity-60' : ''}">
      ${summaryCardHtml('Tokens da IA', fmtCompact(tokens), `${fmtCompact(sum('ai_prompt_tokens'))} entrada · ${fmtCompact(sum('ai_completion_tokens'))} saída`, 'text-brand-orange')}
      ${summaryCardHtml('Mensagens da IA', fmtInt(msgs), msgs ? `${fmtInt(Math.round(tokens / msgs))} tokens por mensagem` : 'nenhuma no período', 'text-brand-blue')}
      ${summaryCardHtml('Aberturas do cardápio', fmtInt(sum('opens')), `${fmtInt(sum('visitors'))} visitantes únicos (soma por restaurante)`)}
      ${summaryCardHtml('Pedidos', fmtInt(sum('orders')), `${fmtMoney(sum('revenue'))} faturados`, 'text-emerald-600')}
    </section>`

  if (rows.length === 0) {
    return cards + `<div class="bg-white rounded-2xl border border-neutral-200">${emptyStateHtml('🔍', all.length ? 'Nenhum restaurante encontrado para essa busca.' : 'Nenhum restaurante cadastrado.')}</div>`
  }

  const header = `<div class="hidden md:grid grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_1.5rem] gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-100">
    <span>Restaurante</span><span class="text-right">Produtos</span><span class="text-right">Aberturas</span><span class="text-right">Msgs IA</span><span class="text-right">Tokens</span><span class="text-right">Pedidos</span><span class="text-right">Faturamento</span><span></span></div>`

  return `${cards}
    <section class="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden ${analytics.loading ? 'opacity-60' : ''}">
      ${header}
      <div class="divide-y divide-neutral-100">${rows.map(analyticsRowHtml).join('')}</div>
    </section>`
}

function statusPills(r) {
  return `${restaurantStatusPill(r.is_active)}${r.has_access ? '' : '<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sem acesso</span>'}`
}

function analyticsRowHtml(r) {
  const open = analytics.expanded === r.id
  const chevron = `<span class="text-neutral-400 transition ${open ? 'rotate-180' : ''}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>`
  return `
    <div>
      <button type="button" data-arow="${r.id}" aria-expanded="${open}" class="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-neutral-50 transition">
        <div class="md:grid md:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_1.5rem] md:gap-3 md:items-center">
          <div class="min-w-0">
            <p class="font-semibold text-neutral-900 break-words">${escapeHtml(r.name)}</p>
            <div class="flex flex-wrap gap-1.5 mt-1">${statusPills(r)}</div>
          </div>
          <dl class="grid grid-cols-3 gap-x-3 gap-y-2 mt-3 md:mt-0 md:contents text-sm">
            ${[
              ['Produtos', fmtInt(r.products)],
              ['Aberturas', `${fmtInt(r.opens)}`],
              ['Msgs IA', fmtInt(r.ai_messages)],
              ['Tokens', `<span class="text-brand-orange font-semibold">${fmtCompact(r.ai_total_tokens)}</span>`],
              ['Pedidos', fmtInt(r.orders)],
              ['Faturamento', fmtMoney(r.revenue)],
            ]
              .map(([label, value]) => `<div class="md:text-right"><dt class="md:hidden text-[11px] text-neutral-400">${label}</dt><dd class="text-neutral-800 tabular-nums">${value}</dd></div>`)
              .join('')}
          </dl>
          <div class="hidden md:flex justify-end">${chevron}</div>
        </div>
      </button>
      ${open ? analyticsDetailHtml(r) : ''}
    </div>`
}

function detailStat(label, value, hint = '') {
  return `<div class="bg-white border border-neutral-200 rounded-xl px-3 py-2.5">
    <p class="text-[11px] text-neutral-400">${label}</p>
    <p class="text-sm font-semibold text-neutral-900 mt-0.5 break-words">${value}</p>
    ${hint ? `<p class="text-[11px] text-neutral-400">${hint}</p>` : ''}
  </div>`
}

function barsHtml(days, series, key, colorClass, unit) {
  const values = days.map((d) => (series[d] ? Number(series[d][key]) : 0))
  const max = Math.max(...values, 1)
  const total = values.reduce((a, b) => a + b, 0)
  const bars = days
    .map((d, i) => {
      const v = values[i]
      const h = v > 0 ? Math.max(6, Math.round((v / max) * 100)) : 2
      return `<div class="flex-1 min-w-[2px] rounded-t ${v > 0 ? colorClass : 'bg-neutral-200'}" style="height:${h}%" title="${shortDate(d)}: ${fmtInt(v)} ${unit}"></div>`
    })
    .join('')
  return `<div>
    <div class="flex items-baseline justify-between mb-1.5"><p class="text-xs font-medium text-neutral-600">${unit === 'tokens' ? 'Tokens por dia' : 'Aberturas por dia'}</p><p class="text-[11px] text-neutral-400">${fmtInt(total)} no período</p></div>
    <div class="flex items-end gap-px h-20 sm:h-24">${bars}</div>
    <div class="flex justify-between text-[10px] text-neutral-400 mt-1"><span>${shortDate(days[0])}</span><span>${shortDate(days[days.length - 1])}</span></div>
  </div>`
}

function analyticsDetailHtml(r) {
  const { from, to } = analyticsRange()
  const days = dateRange(analytics.data.from || from, analytics.data.to || to)
  const series = {}
  for (const row of (analytics.data.daily && analytics.data.daily[r.id]) || []) series[row.d] = row
  const perMsg = r.ai_messages ? Math.round(r.ai_total_tokens / r.ai_messages) : 0
  const cachePct = r.ai_prompt_tokens ? Math.round((r.ai_cache_hit_tokens / r.ai_prompt_tokens) * 100) : 0
  const ticket = r.orders ? fmtMoney(Number(r.revenue) / r.orders) : '—'
  return `
    <div class="bg-neutral-50 border-t border-neutral-100 px-4 sm:px-5 py-4 space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        ${detailStat('Produtos', `${fmtInt(r.products)}`, `${fmtInt(r.products_available)} disponíveis`)}
        ${detailStat('Categorias', fmtInt(r.categories))}
        ${detailStat('Mesas', `${fmtInt(r.mesas)}`, `${fmtInt(r.mesas_active)} ativas`)}
        ${detailStat('Visitantes únicos', fmtInt(r.visitors), `${fmtInt(r.opens)} aberturas`)}
        ${detailStat('Tokens de entrada', fmtInt(r.ai_prompt_tokens), r.ai_prompt_tokens ? `${cachePct}% vieram do cache` : '')}
        ${detailStat('Tokens de saída', fmtInt(r.ai_completion_tokens))}
        ${detailStat('Tokens por mensagem', perMsg ? fmtInt(perMsg) : '—', `${fmtInt(r.ai_messages)} mensagens`)}
        ${detailStat('Pedidos', fmtInt(r.orders), r.orders_cancelled ? `${fmtInt(r.orders_cancelled)} cancelados` : 'nenhum cancelado')}
        ${detailStat('Faturamento', fmtMoney(r.revenue), `ticket médio ${ticket}`)}
        ${detailStat('Última atividade', fmtDateTime(r.last_activity))}
        ${detailStat('Cadastrado em', fmtDateTime(r.created_at))}
        ${detailStat('Link do cardápio', `<a class="text-brand-blue underline" href="${escapeHtml(menuShareUrl(r.slug))}" target="_blank" rel="noreferrer">/${escapeHtml(r.slug)}</a>`)}
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        ${barsHtml(days, series, 'opens', 'bg-brand-blue', 'aberturas')}
        ${barsHtml(days, series, 'tokens', 'bg-brand-orange', 'tokens')}
      </div>
    </div>`
}

// ---------- render + eventos ----------

function renderAnalytics() {
  const controls = document.getElementById('a-controls')
  const results = document.getElementById('a-results')
  if (controls) controls.innerHTML = analyticsControlsHtml()
  if (results) results.innerHTML = analyticsResultsHtml()
}

function exportAnalyticsCsv() {
  if (!analytics.data) return
  const cols = [
    ['Restaurante', (r) => r.name],
    ['Slug', (r) => r.slug],
    ['Ativo', (r) => (r.is_active ? 'sim' : 'não')],
    ['Acesso gerado', (r) => (r.has_access ? 'sim' : 'não')],
    ['Produtos', (r) => r.products],
    ['Produtos disponíveis', (r) => r.products_available],
    ['Categorias', (r) => r.categories],
    ['Mesas', (r) => r.mesas],
    ['Mesas ativas', (r) => r.mesas_active],
    ['Aberturas do cardápio', (r) => r.opens],
    ['Visitantes únicos', (r) => r.visitors],
    ['Mensagens IA', (r) => r.ai_messages],
    ['Tokens entrada', (r) => r.ai_prompt_tokens],
    ['Tokens saída', (r) => r.ai_completion_tokens],
    ['Tokens cache', (r) => r.ai_cache_hit_tokens],
    ['Tokens total', (r) => r.ai_total_tokens],
    ['Tokens por mensagem', (r) => (r.ai_messages ? Math.round(r.ai_total_tokens / r.ai_messages) : 0)],
    ['Pedidos', (r) => r.orders],
    ['Pedidos cancelados', (r) => r.orders_cancelled],
    ['Faturamento (R$)', (r) => Number(r.revenue).toFixed(2).replace('.', ',')],
    ['Última atividade', (r) => (r.last_activity ? new Date(r.last_activity).toLocaleString('pt-BR') : '')],
    ['Cadastrado em', (r) => new Date(r.created_at).toLocaleString('pt-BR')],
  ]
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [cols.map(([h]) => cell(h)).join(';'), ...analyticsRows().map((r) => cols.map(([, f]) => cell(f(r))).join(';'))]
  // BOM: o Excel em português só abre acentos corretamente com ele; ";" é o separador padrão de lá.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `analise_${analytics.data.from}_${analytics.data.to}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function bindAnalyticsEvents() {
  const rootEl = document.getElementById('analytics-root')
  if (!rootEl) return

  rootEl.addEventListener('click', (e) => {
    const preset = e.target.closest('[data-apreset]')
    if (preset) {
      const raw = preset.getAttribute('data-apreset')
      analytics.preset = raw === 'custom' ? 'custom' : Number(raw)
      if (analytics.preset === 'custom') {
        // começa o período personalizado nos últimos 7 dias
        const r = { to: new Date(), from: new Date() }
        r.from.setDate(r.to.getDate() - 6)
        analytics.from = analytics.from || localDateStr(r.from)
        analytics.to = analytics.to || localDateStr(r.to)
        renderAnalytics()
        return
      }
      loadAnalytics()
      return
    }
    if (e.target.closest('[data-aapply]')) {
      analytics.from = document.getElementById('a-from').value
      analytics.to = document.getElementById('a-to').value
      loadAnalytics()
      return
    }
    if (e.target.closest('[data-arefresh]')) {
      loadAnalytics()
      return
    }
    if (e.target.closest('[data-aexport]')) {
      exportAnalyticsCsv()
      return
    }
    const row = e.target.closest('[data-arow]')
    if (row) {
      const id = row.getAttribute('data-arow')
      analytics.expanded = analytics.expanded === id ? null : id
      document.getElementById('a-results').innerHTML = analyticsResultsHtml()
    }
  })

  // Busca e ordenação só refazem a lista (o campo de busca não perde o foco).
  rootEl.addEventListener('input', (e) => {
    if (e.target.id === 'a-search') {
      analytics.query = e.target.value
      document.getElementById('a-results').innerHTML = analyticsResultsHtml()
    }
  })
  rootEl.addEventListener('change', (e) => {
    if (e.target.id === 'a-sort') {
      analytics.sort = e.target.value
      document.getElementById('a-results').innerHTML = analyticsResultsHtml()
    }
  })
}
