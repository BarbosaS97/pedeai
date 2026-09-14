// logo.js
//
// Marca "SeuAri" — logo oficial em imagem (images/logo.png), já com a
// tagline "Cardápio Digital" embutida na arte.
//
// A URL da imagem é resolvida a partir de onde o PRÓPRIO SCRIPT está
// carregado (document.currentScript), não de onde a página está — assim
// funciona tanto chamado como "js/logo.js" (landing, na raiz) quanto
// "../js/logo.js" (admin/, restaurante/, cliente/), sem precisar de um
// caminho relativo diferente em cada página.
const LOGO_IMAGE_URL = new URL('../images/logo.png', document.currentScript.src).href

const LOGO_SIZE_CLASSES = {
  sm: 'h-7',
  md: 'h-10 sm:h-12',
  lg: 'h-16 sm:h-20',
}

function renderLogo(options) {
  const { size = 'md' } = options || {}
  return `<img src="${LOGO_IMAGE_URL}" alt="SeuAri — Cardápio Digital" class="${LOGO_SIZE_CLASSES[size]} w-auto" />`
}
