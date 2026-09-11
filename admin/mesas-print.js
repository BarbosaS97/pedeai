// mesas-print.js — página admin/mesas-print.html?restaurant=<id>
//
// Gera uma folha A4 com um QR Code por mesa (cada um aponta pra
// cliente/index.html?slug=X&mesa=Y), pronta pra imprimir ou salvar como PDF
// (window.print() — o diálogo "Salvar como PDF" do próprio navegador já
// resolve isso, sem precisar de nenhuma lib de PDF).

const root = document.getElementById('root')
const restaurantId = new URLSearchParams(location.search).get('restaurant')

function mesaSortComparator(a, b) {
  const na = parseInt(a.numero, 10)
  const nb = parseInt(b.numero, 10)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true })
}

function toolbarHtml(restaurant, count) {
  return `
    <div class="toolbar no-print">
      <div>
        <h1>Folha de QR Codes — ${escapeHtml(restaurant.name)}</h1>
        <p>${count} mesa${count === 1 ? '' : 's'} · A4, pronta pra imprimir ou salvar como PDF</p>
      </div>
      <button id="print-btn" class="print-btn">Imprimir / Salvar como PDF</button>
    </div>
  `
}

async function init() {
  if (!restaurantId) {
    root.innerHTML = `<p class="empty">Link inválido — falta o restaurante.</p>`
    return
  }

  const { data: restaurant } = await supabaseClient
    .from('restaurants')
    .select('id, name, slug')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    root.innerHTML = `<p class="empty">Restaurante não encontrado.</p>`
    return
  }

  const { data: mesasData } = await supabaseClient.from('mesas').select('*').eq('restaurant_id', restaurant.id)
  const mesas = (mesasData || []).slice().sort(mesaSortComparator)

  if (mesas.length === 0) {
    root.innerHTML = `
      ${toolbarHtml(restaurant, 0)}
      <p class="empty">Nenhuma mesa cadastrada para este restaurante ainda. Volte ao admin e gere as mesas primeiro.</p>
    `
    return
  }

  root.innerHTML = `
    ${toolbarHtml(restaurant, mesas.length)}
    <div class="page"><div class="sheet" id="sheet"></div></div>
  `
  document.getElementById('print-btn').addEventListener('click', () => window.print())

  const sheet = document.getElementById('sheet')
  const base = menuUrl(restaurant.slug)

  // Gera os QR Codes um a um (em vez de Promise.all) pra não travar a aba
  // gerando dezenas de canvases de uma vez só se o restaurante tiver muitas
  // mesas — a folha vai aparecendo mesa por mesa, o que também já serve como
  // indicação visual de progresso.
  for (const mesa of mesas) {
    const url = `${base}&mesa=${encodeURIComponent(mesa.numero)}`
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 600,
      margin: 1,
      color: { dark: '#1F1147', light: '#FFFFFF' },
    })
    sheet.insertAdjacentHTML(
      'beforeend',
      `
      <div class="mesa-card">
        <p class="mesa-number">Mesa ${escapeHtml(mesa.numero)}</p>
        <img class="mesa-qr" src="${qrDataUrl}" alt="QR Code da mesa ${escapeHtml(mesa.numero)}" />
        <p class="mesa-restaurant">${escapeHtml(restaurant.name)}</p>
      </div>
    `
    )
  }
}

init()
