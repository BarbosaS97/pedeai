// logo.js
//
// Marca "PedeAí" com destaque tipográfico no "AI": explora a ambiguidade
// "pede aí" (convite coloquial) / "pede AI" (camada de inteligência
// artificial do produto).

const LOGO_SIZE_CLASSES = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
}

function renderLogo(options) {
  const { size = 'md', showSlogan = false, light = false } = options || {}
  // Variante "light": para usar em cima de fundo colorido (ex: cabeçalho do
  // cardápio) — o texto com gradiente laranja/vermelho perderia contraste
  // ali, então vira branco sólido, com "AI" só um pouco mais translúcido pra
  // ainda separar visualmente as duas partes do nome.
  const pedeClass = light ? 'text-white' : 'bg-gradient-to-r from-brand-orange to-brand-red bg-clip-text text-transparent'
  const aiClass = light ? 'text-white/80' : 'brand-ai'
  return `
    <div class="inline-flex flex-col items-start">
      <span class="font-extrabold tracking-tight ${LOGO_SIZE_CLASSES[size]}"
        ><span class="${pedeClass}">Pede</span
        ><span class="${aiClass}">AI</span></span
      >${showSlogan ? `<span class="text-xs ${light ? 'text-white/70' : 'text-neutral-500'} font-medium">Pede aí. A IA sugere.</span>` : ''}
    </div>
  `
}
