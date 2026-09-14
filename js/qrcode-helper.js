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
// para a URL pública do cardápio.
async function generateMenuQrCode(slug) {
  const url = menuUrl(slug)
  return QRCode.toDataURL(url, {
    width: 480,
    margin: 2,
    color: {
      dark: '#1F1147', // roxo escuro, combina com a identidade tecnológica da marca
      light: '#FFFFFF',
    },
  })
}

// URL do painel do restaurante: {APP_URL}restaurante/index.html?token=...
// Mesma lógica de resolução de base que menuUrl(). Chamada a partir de
// admin/index.html (uma pasta abaixo da raiz).
function panelUrl(accessToken) {
  const configured = window.PEDEAI_CONFIG.APP_URL
  const base = configured
    ? configured.replace(/\/?$/, '/') + 'restaurante/'
    : new URL('../restaurante/', window.location.href).href
  return `${base}index.html?token=${encodeURIComponent(accessToken)}`
}

