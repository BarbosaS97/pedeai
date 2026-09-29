// logo.js
//
// Marca "PapeiAI" — logo oficial em imagem (images/logo.png), já com a
// tagline "Cardápio Digital" embutida na arte.
//
// A URL da imagem é resolvida a partir de onde o PRÓPRIO SCRIPT está
// carregado (document.currentScript), não de onde a página está — assim
// funciona tanto chamado como "js/logo.js" (landing, na raiz) quanto
// "../js/logo.js" (admin/, restaurante/, cliente/), sem precisar de um
// caminho relativo diferente em cada página.
const LOGO_IMAGE_URL = new URL('../images/logo.png', document.currentScript.src).href
// Versão pro fundo escuro: mesma arte, mas com o "Papei" (azul-escuro, some no
// escuro) em branco-gelo. O "AI" laranja é idêntico.
const LOGO_DARK_IMAGE_URL = new URL('../images/logo-dark.png', document.currentScript.src).href

const LOGO_SIZE_CLASSES = {
  sm: 'h-9',
  md: 'h-10 sm:h-12',
  lg: 'h-16 sm:h-20',
}

// Renderiza as duas versões; o CSS (css/style.css, ".logo-on-*") mostra a certa
// conforme o tema: html[data-theme="dark"] (admin e painel, com botão de tema)
// ou html[data-logo="dark"] (cardápio do cliente, sempre escuro).
function renderLogo(options) {
  const { size = 'md' } = options || {}
  const cls = `${LOGO_SIZE_CLASSES[size]} w-auto`
  const alt = 'PapeiAI — Cardápio Digital'
  return `<img src="${LOGO_IMAGE_URL}" alt="${alt}" class="logo-on-light ${cls}" /><img src="${LOGO_DARK_IMAGE_URL}" alt="${alt}" class="logo-on-dark ${cls}" />`
}
