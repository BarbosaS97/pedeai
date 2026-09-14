// landing.js — página inicial (index.html), landing page só de conversão.
//
// Sem fluxo de "carregar dados" como as outras páginas do app (painel,
// cardápio) — o conteúdo é todo estático no próprio index.html. Este
// arquivo só cuida do formulário de contato: abrir/fechar o modal, validar
// e mandar o lead (nome/telefone/email) pro Supabase.

document.getElementById('header-logo-slot').innerHTML = renderLogo({ size: 'sm' })
document.getElementById('footer-logo-slot').innerHTML = renderLogo({ size: 'sm' })

const leadOverlay = document.getElementById('lead-overlay')
const leadFormWrap = document.getElementById('lead-form-wrap')
const leadSuccess = document.getElementById('lead-success')
const leadForm = document.getElementById('lead-form')
const leadError = document.getElementById('lead-error')
const leadSubmitBtn = document.getElementById('lead-submit-btn')

function maskPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11
}

function isValidEmail(email) {
  // Checagem simples (não é validação exaustiva de RFC) — só pra pegar erro
  // de digitação óbvio antes de mandar pro banco.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function openLeadModal() {
  leadOverlay.classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}

function closeLeadModal() {
  leadOverlay.classList.add('hidden')
  document.body.style.overflow = ''
}

// Reseta o modal pro estado de formulário (vazio) sempre que reaberto depois
// de um envio — evita reabrir já mostrando "Recebemos seus dados!" de novo.
function resetLeadModal() {
  leadForm.reset()
  leadError.classList.add('hidden')
  leadSubmitBtn.disabled = false
  leadSubmitBtn.textContent = 'Enviar'
  leadSuccess.classList.add('hidden')
  leadFormWrap.classList.remove('hidden')
}

document.getElementById('cta-hero').addEventListener('click', () => {
  resetLeadModal()
  openLeadModal()
})
document.getElementById('cta-bottom').addEventListener('click', () => {
  resetLeadModal()
  openLeadModal()
})
document.getElementById('lead-close-btn').addEventListener('click', closeLeadModal)
document.getElementById('lead-success-close').addEventListener('click', closeLeadModal)
leadOverlay.addEventListener('click', (e) => {
  if (e.target === leadOverlay) closeLeadModal()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !leadOverlay.classList.contains('hidden')) closeLeadModal()
})

document.getElementById('lead-phone').addEventListener('input', (e) => {
  e.target.value = maskPhone(e.target.value)
})

leadForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  const name = document.getElementById('lead-name').value.trim()
  const phone = document.getElementById('lead-phone').value.trim()
  const email = document.getElementById('lead-email').value.trim()

  if (!name || !isValidPhone(phone) || !isValidEmail(email)) {
    leadError.classList.remove('hidden')
    return
  }
  leadError.classList.add('hidden')

  leadSubmitBtn.disabled = true
  leadSubmitBtn.textContent = 'Enviando...'

  const { error } = await supabaseClient.from('leads').insert({ name, phone, email })

  if (error) {
    leadSubmitBtn.disabled = false
    leadSubmitBtn.textContent = 'Enviar'
    showToast('Não deu pra enviar agora: ' + errorMessage(error), 'error', 5000)
    return
  }

  leadFormWrap.classList.add('hidden')
  leadSuccess.classList.remove('hidden')
})
