// qrcode-helper.js
//
// Requer que config.js e a lib `qrcode` (CDN, UMD, global `QRCode`) já
// tenham sido carregados antes deste arquivo.

// URL pública do cardápio de um restaurante: {APP_URL}cliente/index.html?slug=...
// Se PEDEAI_CONFIG.APP_URL estiver vazio, resolve a partir de onde a página
// atual está rodando — funciona tanto no Live Server (localhost) quanto em
// qualquer hospedagem estática, sem precisar configurar nada.
//
// Assume que quem chama esta função está sempre uma pasta abaixo da raiz do
// projeto (admin/index.html ou restaurante/index.html), então "../cliente/"
// sobe para a raiz e desce para a pasta do cardápio.
function menuUrl(slug) {
  const configured = window.PEDEAI_CONFIG.APP_URL
  const base = configured ? configured.replace(/\/?$/, '/') + 'cliente/' : new URL('../cliente/', window.location.href).href
  return `${base}index.html?slug=${encodeURIComponent(slug)}`
}

// Gera o QR Code 100% no cliente (sem chamar serviço externo), apontando
// para a URL pública do cardápio. width:640 dá margem de sobra pra imprimir
// pequeno (ex: adesivo de ~25mm pra colar nos acrílicos de mesa, ver
// admin.js/qrModalHtml — a ~650 DPI nesse tamanho, bem acima do mínimo de
// 300 DPI recomendado pra impressão nítida) sem exagerar no tamanho do
// arquivo do PNG gerado.
async function generateMenuQrCode(slug) {
  const url = menuUrl(slug)
  return QRCode.toDataURL(url, {
    width: 640,
    margin: 2,
    color: {
      dark: '#1F1147', // roxo escuro, combina com a identidade tecnológica da marca
      light: '#FFFFFF',
    },
  })
}

// URL "bonita" (mesmo domínio do site) pensada pra ser colada em
// WhatsApp/redes sociais — passa pela rota /cardapio/:slug (ver
// vercel.json + api/cardapio-preview.js), que devolve uma prévia com a foto
// do restaurante (ou nenhuma, se não tiver) pra quem for receber o link, e
// redireciona quem clica de verdade pro cardápio de verdade (menuUrl()).
// Só pros links pensados pra COMPARTILHAR como texto (ex: "copiar link" do
// admin) — o QR Code continua apontando direto pra menuUrl(), sem esse
// salto extra, já que ninguém "pré-visualiza" um QR Code escaneado.
function menuShareUrl(slug) {
  const configured = window.PEDEAI_CONFIG.APP_URL
  const base = configured ? configured.replace(/\/?$/, '/') : new URL('../', window.location.href).href
  return `${base}cardapio/${encodeURIComponent(slug)}`
}

// URL do painel do restaurante: {APP_URL}restaurante/index.html (o acesso é
// por login — ver restaurante/auth.js). Mesma lógica de resolução de base que
// menuUrl(). Chamada a partir de admin/index.html (uma pasta abaixo da raiz).
function panelUrl() {
  const configured = window.PEDEAI_CONFIG.APP_URL
  const base = configured
    ? configured.replace(/\/?$/, '/') + 'restaurante/'
    : new URL('../restaurante/', window.location.href).href
  return `${base}index.html`
}
