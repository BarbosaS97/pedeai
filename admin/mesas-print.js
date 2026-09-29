// mesas-print.js — página admin/mesas-print.html
//
// Parâmetros aceitos na URL (qualquer um identifica o restaurante):
//   ?restaurant_id=<uuid>  (ou o antigo ?restaurant=<uuid>)
//   ?slug=<slug>
//
// Gera a arte completa do display de mesa (images/arte-mesa-base.png) uma por
// mesa, com o QR Code e o número da mesa encaixados por cima da arte, e
// organiza 8 por folha A4 (paisagem, 4×2) pra imprimir ou salvar como PDF
// (window.print()).

const root = document.getElementById('root')
const params = new URLSearchParams(location.search)

const CARDS_PER_PAGE = 8

function mesaSortComparator(a, b) {
  const na = parseInt(a.numero, 10)
  const nb = parseInt(b.numero, 10)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true })
}

// Deixa o navegador respirar entre uma arte e outra (o toCanvas do QR é
// síncrono por dentro), pra a barra de progresso realmente pintar.
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

async function findRestaurant() {
  const id = params.get('restaurant_id') || params.get('restaurant')
  const slug = params.get('slug')
  let q = supabaseClient.from('restaurants').select('id, name, slug')
  if (id) q = q.eq('id', id)
  else if (slug) q = q.eq('slug', slug)
  else return null
  const { data } = await q.maybeSingle()
  return data
}

// Número longo (ex: "8 — Varanda") não cabe na linha da arte: encolhe a fonte
// proporcionalmente em vez de vazar pra fora do campo.
function numberFontScale(text) {
  const maxChars = 5
  return text.length > maxChars ? maxChars / text.length : 1
}

function cardHtml(mesa) {
  const label = String(mesa.numero)
  return `
    <div class="cell">
      <div class="art" data-mesa="${escapeHtml(label)}">
        <img class="art-bg" src="../images/arte-mesa-base.png" alt="" />
        <div class="qr-plate"><canvas class="qr-canvas"></canvas></div>
        <div class="mesa-num" style="--scale:${numberFontScale(label).toFixed(3)}">${escapeHtml(label)}</div>
      </div>
    </div>
  `
}

function toolbarHtml(restaurant, count) {
  const pages = Math.ceil(count / CARDS_PER_PAGE)
  return `
    <div class="toolbar no-print">
      <div>
        <h1>Artes das mesas — ${escapeHtml(restaurant.name)}</h1>
        <p>${count} mesa${count === 1 ? '' : 's'} · ${pages} folha${pages === 1 ? '' : 's'} A4 (paisagem, ${CARDS_PER_PAGE} artes por folha)</p>
        <p class="print-tip">⚠ No diálogo de impressão: Papel <strong>A4</strong>, Orientação <strong>Paisagem</strong>, Margens <strong>Nenhuma</strong> e Escala <strong>100%</strong>. Ajustar à página encolhe as artes e o QR Code.</p>
        <div class="progress" id="progress" hidden>
          <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
          <span id="progress-text"></span>
        </div>
      </div>
      <button id="print-btn" class="print-btn" disabled>Imprimir</button>
    </div>
  `
}

async function init() {
  const restaurant = await findRestaurant()
  if (!restaurant) {
    root.innerHTML = `<p class="empty">Link inválido ou restaurante não encontrado.</p>`
    return
  }

  const { data: mesasData } = await supabaseClient
    .from('mesas')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('ativo', true)
  const mesas = (mesasData || []).slice().sort(mesaSortComparator)

  if (mesas.length === 0) {
    root.innerHTML = `
      ${toolbarHtml(restaurant, 0)}
      <p class="empty">Nenhuma mesa ativa para este restaurante. Volte ao admin e gere ou ative as mesas primeiro.</p>
    `
    return
  }

  // Uma .page (folha) por 8 mesas — o esqueleto todo entra de uma vez; só os
  // QR Codes são desenhados aos poucos.
  let pagesHtml = ''
  for (let i = 0; i < mesas.length; i += CARDS_PER_PAGE) {
    pagesHtml += `<div class="page">${mesas.slice(i, i + CARDS_PER_PAGE).map(cardHtml).join('')}</div>`
  }
  root.innerHTML = `${toolbarHtml(restaurant, mesas.length)}<div class="pages">${pagesHtml}</div>`

  const printBtn = document.getElementById('print-btn')
  printBtn.addEventListener('click', () => window.print())

  const progress = document.getElementById('progress')
  const fill = document.getElementById('progress-fill')
  const text = document.getElementById('progress-text')
  progress.hidden = false

  const base = menuUrl(restaurant.slug)
  const canvases = root.querySelectorAll('.qr-canvas')

  for (let i = 0; i < mesas.length; i++) {
    text.textContent = `Gerando arte ${i + 1} de ${mesas.length}...`
    fill.style.width = `${(i / mesas.length) * 100}%`
    await nextFrame()

    const url = `${base}&mesa=${encodeURIComponent(mesas[i].numero)}`
    await QRCode.toCanvas(canvases[i], url, {
      width: 600,
      margin: 2, // margem de silêncio: 2 módulos brancos, somada ao branco da moldura da arte
      errorCorrectionLevel: 'M',
      color: { dark: '#1F1147', light: '#FFFFFF' },
    })
  }

  fill.style.width = '100%'
  text.textContent = `${mesas.length} arte${mesas.length === 1 ? '' : 's'} pronta${mesas.length === 1 ? '' : 's'}.`
  printBtn.disabled = false
}

init()
