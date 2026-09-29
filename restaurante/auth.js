// auth.js — login, primeiro acesso e recuperação de senha do painel do
// restaurante (Supabase Auth). Carregado antes de painel.js.
//
// Estados possíveis de quem abre restaurante/index.html:
//   1. sem sessão                          → tela de login (+ "Esqueci a senha")
//   2. veio do link "redefinir senha"      → tela de nova senha (recuperação)
//   3. sessão com must_reset, e-mail ainda é o sintético do acesso provisório
//                                          → passo 1 do primeiro acesso: informar e-mail
//      (o Supabase manda o link de confirmação via SMTP — Resend — e o
//       usuário volta pra cá já com o e-mail confirmado)
//   4. sessão com must_reset, e-mail real  → passo 2: definir a nova senha
//      (ao salvar, chama a Edge Function restaurant-finish-setup, que
//       desliga must_reset)
//   5. sessão normal                       → authGate() resolve e o painel abre
//
// Acesso provisório = login (slug do restaurante) + senha gerados pelo super
// admin. O login sem "@" vira "<login>@acesso.papeiai.com.br" (o Supabase Auth
// só entende e-mail; ver supabase/functions/admin-generate-access).

const SYNTHETIC_EMAIL_DOMAIN = 'acesso.papeiai.com.br'
const MIN_PASSWORD_LENGTH = 8

function loginToEmail(login) {
  const value = login.trim().toLowerCase()
  return value.includes('@') ? value : `${value}@${SYNTHETIC_EMAIL_DOMAIN}`
}

function isProvisionalEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)
}

function mustResetSetup(user) {
  return user?.app_metadata?.must_reset === true
}

// Página de volta dos links enviados por e-mail (confirmação e recuperação).
// Precisa estar em Authentication → URL Configuration → Redirect URLs.
function panelReturnUrl() {
  return location.origin + location.pathname
}

// ---- Visual: layout da tela (estilos em css/style.css, bloco "auth-") ----

const AUTH_ICONS = {
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
}

function authIcon(name, { size = 18, cls = '' } = {}) {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AUTH_ICONS[name]}</svg>`
}

const AUTH_SPINNER = `<svg class="auth-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>`

// Campo de texto com ícone à esquerda.
function authFieldHtml({ name, type = 'text', placeholder, autocomplete, icon, extra = '' }) {
  return `
    <div class="auth-field">
      ${authIcon(icon, { cls: 'auth-lead' })}
      <input name="${name}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" required class="auth-input" ${extra} />
    </div>
  `
}

// Campo de senha, com o "olho" pra mostrar/ocultar (ver listener no fim do arquivo).
function authPasswordFieldHtml({ name, placeholder, autocomplete, extra = '' }) {
  return `
    <div class="auth-field">
      ${authIcon('lock', { cls: 'auth-lead' })}
      <input name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" required class="auth-input" ${extra} />
      <button type="button" data-auth-eye class="auth-eye" title="Mostrar senha" aria-label="Mostrar senha">${authIcon('eye')}</button>
    </div>
  `
}

// Passos do primeiro acesso (1 = e-mail, 2 = confirmar, 3 = senha).
function authStepsHtml(current) {
  const labels = ['E-mail', 'Confirmar', 'Senha']
  return `
    <div class="auth-steps" aria-label="Passo ${current} de 3">
      ${labels
        .map((label, i) => {
          const n = i + 1
          const state = n < current ? 'is-done' : n === current ? 'is-current' : ''
          const dot = `<span class="auth-step-dot ${state}" title="${label}">${n < current ? authIcon('check', { size: 14 }) : n}</span>`
          const bar = n < 3 ? `<span class="auth-step-bar ${n < current ? 'is-done' : ''}"></span>` : ''
          return dot + bar
        })
        .join('')}
    </div>
  `
}

function authShellHtml(title, subtitle, body, { step = 0, icon = '' } = {}) {
  return `
    <div class="auth-page">
      ${themeToggleHtml('fixed top-4 right-4 z-20')}

      <aside class="auth-hero">
        <span class="auth-blob auth-blob--orange"></span>
        <span class="auth-blob auth-blob--blue"></span>
        <div class="relative z-10 w-full max-w-md text-center space-y-6">
          <div class="flex justify-center">${renderLogo({ size: 'lg' })}</div>
          <img src="../images/hero-ari.png" alt="Ari, o garçom de IA do PapeiAI" class="auth-ari mx-auto w-full max-w-sm" />
          <div class="space-y-1.5">
            <h2 class="auth-hero-title text-2xl font-extrabold">Seu cardápio, com o Ari no atendimento.</h2>
            <p class="auth-hero-sub text-sm">Cadastre produtos, acompanhe pedidos e deixe o Ari cuidar do resto.</p>
          </div>
        </div>
      </aside>

      <main class="auth-main">
        <span class="auth-blob auth-blob--orange"></span>
        <span class="auth-blob auth-blob--blue"></span>
        <div class="auth-card">
          <div class="auth-stagger space-y-5">
            <div class="flex justify-center lg:hidden">${renderLogo({ size: 'lg' })}</div>
            ${step ? authStepsHtml(step) : ''}
            ${icon}
            <div class="text-center space-y-1.5">
              <h1 class="text-xl sm:text-2xl font-extrabold text-neutral-900">${title}</h1>
              ${subtitle ? `<p class="text-sm text-neutral-500 leading-relaxed">${subtitle}</p>` : ''}
            </div>
            ${body}
          </div>
        </div>
      </main>
    </div>
  `
}

function authErrorHtml(message) {
  return message
    ? `<p class="auth-error text-brand-red text-sm flex items-start gap-1.5 bg-brand-red/5 rounded-xl px-3 py-2" role="alert">⚠️ <span>${escapeHtml(message)}</span></p>`
    : ''
}

function authSubmitBtn(label) {
  return `<button type="submit" class="auth-btn"><span data-auth-btn-label>${label}</span></button>`
}

// Liga o submit de um formulário do gate com "trava" de duplo clique, spinner
// no botão e mensagem de erro (com tremidinha) no lugar — cada tela devolve
// { error? }.
function bindAuthForm(id, handler) {
  const form = document.getElementById(id)
  if (!form) return
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button[type="submit"]')
    const originalHtml = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = `${AUTH_SPINNER}<span>Aguarde...</span>`
    const errorBox = form.querySelector('[data-auth-error]')
    if (errorBox) errorBox.innerHTML = ''
    try {
      const result = await handler(new FormData(form))
      if (result?.error && errorBox) errorBox.innerHTML = authErrorHtml(result.error)
    } catch (err) {
      if (errorBox) errorBox.innerHTML = authErrorHtml('Algo deu errado. Tente de novo.')
      console.error(err)
    }
    // Se a tela já foi trocada por outra, o botão antigo nem existe mais.
    if (btn.isConnected) {
      btn.disabled = false
      btn.innerHTML = originalHtml
    }
  })
}

// Olho de mostrar/ocultar senha — delegado no document porque as telas são
// re-renderizadas via innerHTML.
document.addEventListener('click', (e) => {
  const eye = e.target.closest('[data-auth-eye]')
  if (!eye) return
  const input = eye.parentElement.querySelector('input')
  const show = input.type === 'password'
  input.type = show ? 'text' : 'password'
  eye.innerHTML = authIcon(show ? 'eyeOff' : 'eye')
  eye.title = eye.ariaLabel = show ? 'Ocultar senha' : 'Mostrar senha'
  input.focus()
})

// Mensagem amigável pros erros de login/recuperação do Supabase Auth. Com o
// CAPTCHA ligado (Attack Protection) o Auth recusa sem token válido
// (captcha_failed); os rate limits do Auth respondem 429.
function authFailureMessage(error, fallback) {
  if (error?.code === 'captcha_failed' || /captcha/i.test(error?.message || ''))
    return 'Não foi possível validar a verificação de segurança. Tente de novo.'
  if (error?.status === 429 || error?.code === 'over_request_rate_limit')
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  return fallback
}

const AUTH_CAPTCHA_WAIT = 'Aguarde a verificação de segurança terminar e tente de novo.'

function validateNewPassword(password, confirm) {
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (password !== confirm) return 'As senhas não conferem.'
  return null
}

async function signOutAndReload() {
  await supabaseClient.auth.signOut()
  location.href = panelReturnUrl()
}

// ---- Telas ----

function showLoginScreen(root, { info = '' } = {}) {
  root.innerHTML = authShellHtml(
    'Bem-vindo de volta!',
    'Entre para gerenciar o cardápio e acompanhar os pedidos do seu restaurante.',
    `
      <form id="auth-login-form" class="space-y-3.5">
        ${info ? `<p class="auth-info text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">${escapeHtml(info)}</p>` : ''}
        ${authFieldHtml({ name: 'login', placeholder: 'E-mail ou login provisório', autocomplete: 'username', icon: 'user', extra: 'autocapitalize="none" spellcheck="false"' })}
        ${authPasswordFieldHtml({ name: 'password', placeholder: 'Senha', autocomplete: 'current-password' })}
        <div id="auth-login-turnstile"></div>
        <div data-auth-error></div>
        ${authSubmitBtn('Entrar')}
        <div class="text-center pt-1"><button type="button" id="auth-forgot-btn" class="auth-link">Esqueci minha senha</button></div>
      </form>
      <p class="text-xs text-neutral-400 text-center leading-relaxed">Primeiro acesso? Use o login e a senha provisórios que você recebeu do PapeiAI.</p>
    `
  )
  const turnstile = mountTurnstile(document.getElementById('auth-login-turnstile'))
  bindAuthForm('auth-login-form', async (form) => {
    const captchaToken = turnstile.getToken()
    if (turnstileEnabled() && !captchaToken) return { error: AUTH_CAPTCHA_WAIT }
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: loginToEmail(form.get('login')),
      password: form.get('password'),
      options: { captchaToken },
    })
    if (error) {
      turnstile.reset() // o token vale uma tentativa só
      return { error: authFailureMessage(error, 'Login ou senha incorretos.') }
    }
    // onAuthStateChange (authGate) reavalia a sessão e troca de tela.
  })
  document.getElementById('auth-forgot-btn').addEventListener('click', () => showForgotScreen(root))
}

function showForgotScreen(root) {
  root.innerHTML = authShellHtml(
    'Recuperar senha',
    'Digite o e-mail cadastrado e enviaremos um link para você criar uma nova senha.',
    `
      <form id="auth-forgot-form" class="space-y-3.5">
        ${authFieldHtml({ name: 'email', type: 'email', placeholder: 'Seu e-mail', autocomplete: 'email', icon: 'mail' })}
        <div id="auth-forgot-turnstile"></div>
        <div data-auth-error></div>
        ${authSubmitBtn('Enviar link')}
        <div class="text-center pt-1"><button type="button" id="auth-back-btn" class="auth-link">← Voltar ao login</button></div>
      </form>
      <p class="text-xs text-neutral-400 text-center leading-relaxed">Ainda não definiu seu e-mail (primeiro acesso)? Peça um novo acesso provisório ao PapeiAI.</p>
    `
  )
  const turnstile = mountTurnstile(document.getElementById('auth-forgot-turnstile'))
  bindAuthForm('auth-forgot-form', async (form) => {
    const email = String(form.get('email')).trim().toLowerCase()
    if (isProvisionalEmail(email)) return { error: 'Use o e-mail que você cadastrou.' }
    const captchaToken = turnstile.getToken()
    if (turnstileEnabled() && !captchaToken) return { error: AUTH_CAPTCHA_WAIT }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: panelReturnUrl(),
      captchaToken,
    })
    if (error && (error.status === 429 || error.code === 'captcha_failed' || /captcha/i.test(error.message || ''))) {
      turnstile.reset()
      return { error: authFailureMessage(error, 'Não foi possível enviar o link. Tente de novo.') }
    }
    // Resposta igual exista o e-mail ou não (não revela quais e-mails estão cadastrados).
    showLoginScreen(root, { info: 'Se esse e-mail estiver cadastrado, enviamos o link para redefinir a senha. Confira também o spam.' })
  })
  document.getElementById('auth-back-btn').addEventListener('click', () => showLoginScreen(root))
}

// Nova senha — usada tanto na recuperação (link do e-mail) quanto no passo 3
// do primeiro acesso (firstAccess = true).
function showNewPasswordScreen(root, { firstAccess, onDone }) {
  root.innerHTML = authShellHtml(
    firstAccess ? 'Crie sua senha' : 'Redefinir senha',
    firstAccess
      ? 'Seu e-mail foi confirmado. Falta só definir a senha que você vai usar daqui pra frente.'
      : 'Escolha uma nova senha para entrar no painel.',
    `
      <form id="auth-newpass-form" class="space-y-3.5">
        ${authPasswordFieldHtml({ name: 'password', placeholder: `Nova senha (mín. ${MIN_PASSWORD_LENGTH})`, autocomplete: 'new-password', extra: `minlength="${MIN_PASSWORD_LENGTH}"` })}
        ${authPasswordFieldHtml({ name: 'confirm', placeholder: 'Repita a nova senha', autocomplete: 'new-password' })}
        <div data-auth-error></div>
        ${authSubmitBtn('Salvar senha')}
        <div class="text-center pt-1"><button type="button" id="auth-signout-btn" class="auth-link">Sair</button></div>
      </form>
    `,
    { step: firstAccess ? 3 : 0 }
  )
  bindAuthForm('auth-newpass-form', async (form) => {
    const password = form.get('password')
    const invalid = validateNewPassword(password, form.get('confirm'))
    if (invalid) return { error: invalid }
    const { error } = await supabaseClient.auth.updateUser({ password })
    if (error) return { error: 'Não foi possível salvar a senha. Tente uma senha diferente da atual.' }
    await onDone()
  })
  document.getElementById('auth-signout-btn').addEventListener('click', signOutAndReload)
}

// Primeiro acesso, passo 1: informar o e-mail do dono. O Supabase manda o
// link de confirmação (Resend, via SMTP configurado no Auth); o e-mail só
// troca de fato depois do clique — até lá o login provisório segue valendo.
function showSetupEmailScreen(root, { sentTo = '' } = {}) {
  if (sentTo) {
    root.innerHTML = authShellHtml(
      'Confirme seu e-mail',
      `Enviamos um link para <strong class="text-neutral-700">${escapeHtml(sentTo)}</strong>. Abra o e-mail (veja o spam também) e clique no link para continuar.`,
      `
        <div class="space-y-2 text-center">
          <button type="button" id="auth-change-email-btn" class="auth-link underline">Usar outro e-mail</button><br />
          <button type="button" id="auth-signout-btn" class="auth-link">Sair</button>
        </div>
      `,
      { step: 2, icon: `<div class="auth-mail-badge">${authIcon('mail', { size: 32 })}</div>` }
    )
    document.getElementById('auth-change-email-btn').addEventListener('click', () => showSetupEmailScreen(root))
    document.getElementById('auth-signout-btn').addEventListener('click', signOutAndReload)
    return
  }

  root.innerHTML = authShellHtml(
    'Primeiro acesso',
    'Cadastre o seu e-mail. Ele será o seu novo login e é para onde enviamos o link de recuperação de senha.',
    `
      <form id="auth-setup-email-form" class="space-y-3.5">
        ${authFieldHtml({ name: 'email', type: 'email', placeholder: 'Seu e-mail', autocomplete: 'email', icon: 'mail' })}
        <div data-auth-error></div>
        ${authSubmitBtn('Enviar link de confirmação')}
        <div class="text-center pt-1"><button type="button" id="auth-signout-btn" class="auth-link">Sair</button></div>
      </form>
    `,
    { step: 1 }
  )
  bindAuthForm('auth-setup-email-form', async (form) => {
    const email = String(form.get('email')).trim().toLowerCase()
    if (isProvisionalEmail(email)) return { error: 'Informe um e-mail válido.' }
    const { error } = await supabaseClient.auth.updateUser({ email }, { emailRedirectTo: panelReturnUrl() })
    if (error) {
      if (error.status === 429) return { error: 'Muitas tentativas. Aguarde alguns minutos.' }
      if (/already|registered|exists/i.test(error.message)) return { error: 'Esse e-mail já está em uso.' }
      return { error: 'Não foi possível enviar o link. Confira o e-mail e tente de novo.' }
    }
    showSetupEmailScreen(root, { sentTo: email })
  })
  document.getElementById('auth-signout-btn').addEventListener('click', signOutAndReload)
}

async function finishSetupOnServer() {
  const { data } = await supabaseClient.auth.getSession()
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/restaurant-finish-setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session.access_token}`,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) throw new Error(body.error || 'Falha ao concluir o primeiro acesso.')
  // Renova o JWT (o app_metadata mudou no servidor).
  await supabaseClient.auth.refreshSession()
}

// Resolve com o usuário quando há uma sessão liberada pra usar o painel.
// Enquanto isso, mostra login / primeiro acesso / recuperação conforme o caso.
function authGate(root) {
  return new Promise((resolve) => {
    let recovery = /type=recovery/.test(location.hash)
    let resolved = false
    // Qual tela está aberta. O Supabase dispara SIGNED_IN de novo quando a aba
    // volta a ter foco; sem isso a tela seria redesenhada e apagaria o que a
    // pessoa estava digitando.
    let currentScreen = null

    function enter(screen, render) {
      if (currentScreen === screen) return
      currentScreen = screen
      render()
    }

    async function route() {
      if (resolved) return
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      const user = session?.user
      if (!user) return enter('login', () => showLoginScreen(root))

      if (recovery) {
        return enter('recovery', () =>
          showNewPasswordScreen(root, {
            firstAccess: false,
            onDone: async () => {
              recovery = false
              history.replaceState(null, '', panelReturnUrl())
              route()
            },
          })
        )
      }

      if (mustResetSetup(user)) {
        if (isProvisionalEmail(user.email)) return enter('setup-email', () => showSetupEmailScreen(root))
        return enter('setup-password', () =>
          showNewPasswordScreen(root, {
            firstAccess: true,
            onDone: async () => {
              await finishSetupOnServer()
              history.replaceState(null, '', panelReturnUrl())
              route()
            },
          })
        )
      }

      resolved = true
      resolve(user)
    }

    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true
      // Só reage a mudanças que trocam de tela; TOKEN_REFRESHED/USER_UPDATED
      // no meio de um formulário não devem apagar o que a pessoa digitou.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') route()
    })

    route()
  })
}
