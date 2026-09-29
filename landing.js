// landing.js — página inicial (index.html), landing page só de conversão.
//
// Sem fluxo de "carregar dados" como as outras páginas do app (painel,
// cardápio) — o conteúdo é todo estático no próprio index.html. Este
// arquivo só cuida do CTA de contato: todo botão .js-cta abre o WhatsApp do
// PapeiAI direto, com uma mensagem já preenchida.

document.getElementById('header-logo-slot').innerHTML = renderLogo({ size: 'sm' })
document.getElementById('footer-logo-slot').innerHTML = renderLogo({ size: 'sm' })

// Número de contato do PapeiAI — DDD + número (11 dígitos, sem "+55"; o
// código do país é prefixado só na hora de montar o link do WhatsApp, mesmo
// padrão usado no resto do app pra número de WhatsApp — ver maskPhone/
// whatsappOrderLink em cliente/cardapio.js).
const WHATSAPP_NUMBER = '61982395208'
const WHATSAPP_MESSAGE = 'Oi! Vi o site do PapeiAI e quero saber mais.'

function whatsappContactUrl() {
  return `https://wa.me/55${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`
}

// Todo botão de contato da página leva a classe .js-cta — nav, hero e CTA
// final, todos abrindo o mesmo WhatsApp.
document.querySelectorAll('.js-cta').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    window.open(whatsappContactUrl(), '_blank', 'noopener')
  })
})
