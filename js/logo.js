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
  const { size = 'md', showSlogan = false } = options || {}
  return `
    <div class="inline-flex flex-col items-start">
      <span class="font-extrabold tracking-tight ${LOGO_SIZE_CLASSES[size]}"
        ><span class="bg-gradient-to-r from-brand-orange to-brand-red bg-clip-text text-transparent">Pede</span
        ><span class="brand-ai">AI</span></span
      >${showSlogan ? '<span class="text-xs text-neutral-500 font-medium">Pede aí. A IA sugere.</span>' : ''}
    </div>
  `
}
