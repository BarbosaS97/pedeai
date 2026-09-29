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

const AUTH_INPUT_CLASS =
  'w-full border border-neutral-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue transition'

function authShellHtml(title, subtitle, body) {
  return `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-blue/10 via-neutral-50 to-brand-orange/10 px-4">
      ${themeToggleHtml('fixed top-4 right-4')}
      <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-5 fade-slide-in">
        <div class="flex justify-center mb-1">${renderLogo({ size: 'lg', showSlogan: true })}</div>
        <div class="text-center space-y-1">
          <h1 class="text-lg font-bold text-neutral-900">${title}</h1>
          ${subtitle ? `<p class="text-sm text-neutral-500">${subtitle}</p>` : ''}
        </div>
        ${body}
      </div>
    </div>
  `
}

function authErrorHtml(message) {
  return message ? `<p class="text-brand-red text-sm flex items-start gap-1.5" role="alert">⚠️ <span>${escapeHtml(message)}</span></p>` : ''
}

const AUTH_PRIMARY_BTN =
  'w-full bg-brand-blue text-white font-semibold rounded-lg py-2.5 shadow-brand-blue hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50'
const AUTH_LINK_BTN = 'text-sm text-neutral-500 hover:text-brand-blue underline transition'

// Liga o submit de um formulário do gate com "trava" de duplo clique e
// mensagem de erro no lugar — cada tela devolve { error? } ou { done: true }.
function bindAuthForm(id, handler) {
  const form = document.getElementById(id)
  if (!form) return
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button[type="submit"]')
    const label = btn.textContent
    btn.disabled = true
    btn.textContent = 'Aguarde...'
    const errorBox = form.querySelector('[data-auth-error]')
    if (errorBox) errorBox.innerHTML = ''
    try {
      const result = await handler(new FormData(form))
      if (result?.error && errorBox) errorBox.innerHTML = authErrorHtml(result.error)
    } catch (err) {
      if (errorBox) errorBox.innerHTML = authErrorHtml('Algo deu errado. Tente de novo.')
      console.error(err)
    }
    btn.disabled = false
    btn.textContent = label
  })
}

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
    'Entrar no painel',
    'Use o e-mail e a senha que você cadastrou. No primeiro acesso, use o login e a senha provisórios que recebeu.',
    `
      <form id="auth-login-form" class="space-y-3">
        ${info ? `<p class="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">${escapeHtml(info)}</p>` : ''}
        <input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="E-mail ou login provisório" class="${AUTH_INPUT_CLASS}" />
        <input name="password" type="password" autocomplete="current-password" required placeholder="Senha" class="${AUTH_INPUT_CLASS}" />
        <div data-auth-error></div>
        <button type="submit" class="${AUTH_PRIMARY_BTN}">Entrar</button>
        <div class="text-center"><button type="button" id="auth-forgot-btn" class="${AUTH_LINK_BTN}">Esqueci minha senha</button></div>
      </form>
    `
  )
  bindAuthForm('auth-login-form', async (form) => {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: loginToEmail(form.get('login')),
      password: form.get('password'),
    })
    if (error) return { error: 'Login ou senha incorretos.' }
    // onAuthStateChange (authGate) reavalia a sessão e troca de tela.
  })
  document.getElementById('auth-forgot-btn').addEventListener('click', () => showForgotScreen(root))
}

function showForgotScreen(root) {
  root.innerHTML = authShellHtml(
    'Recuperar senha',
    'Digite o e-mail cadastrado e enviaremos um link para criar uma nova senha.',
    `
      <form id="auth-forgot-form" class="space-y-3">
        <input name="email" type="email" autocomplete="email" required placeholder="Seu e-mail" class="${AUTH_INPUT_CLASS}" />
        <div data-auth-error></div>
        <button type="submit" class="${AUTH_PRIMARY_BTN}">Enviar link</button>
        <div class="text-center"><button type="button" id="auth-back-btn" class="${AUTH_LINK_BTN}">Voltar ao login</button></div>
      </form>
      <p class="text-xs text-neutral-400 text-center">Ainda não definiu seu e-mail (primeiro acesso)? Peça um novo acesso provisório ao administrador.</p>
    `
  )
  bindAuthForm('auth-forgot-form', async (form) => {
    const email = String(form.get('email')).trim().toLowerCase()
    if (isProvisionalEmail(email)) return { error: 'Use o e-mail que você cadastrou.' }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: panelReturnUrl() })
    if (error && error.status === 429) return { error: 'Muitas tentativas. Aguarde alguns minutos.' }
    // Resposta igual exista o e-mail ou não (não revela quais e-mails estão cadastrados).
    showLoginScreen(root, { info: 'Se esse e-mail estiver cadastrado, enviamos o link para redefinir a senha. Confira também o spam.' })
  })
  document.getElementById('auth-back-btn').addEventListener('click', () => showLoginScreen(root))
}

// Nova senha — usada tanto na recuperação (link do e-mail) quanto no passo 2
// do primeiro acesso (finishSetup = true).
function showNewPasswordScreen(root, { firstAccess, onDone }) {
  root.innerHTML = authShellHtml(
    firstAccess ? 'Crie sua senha' : 'Redefinir senha',
    firstAccess ? 'Seu e-mail foi confirmado. Falta só definir a senha que você vai usar daqui pra frente.' : 'Escolha uma nova senha para entrar no painel.',
    `
      <form id="auth-newpass-form" class="space-y-3">
        <input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Nova senha (mín. ${MIN_PASSWORD_LENGTH} caracteres)" class="${AUTH_INPUT_CLASS}" />
        <input name="confirm" type="password" autocomplete="new-password" required placeholder="Repita a nova senha" class="${AUTH_INPUT_CLASS}" />
        <div data-auth-error></div>
        <button type="submit" class="${AUTH_PRIMARY_BTN}">Salvar senha</button>
        <div class="text-center"><button type="button" id="auth-signout-btn" class="${AUTH_LINK_BTN}">Sair</button></div>
      </form>
    `
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
          <button type="button" id="auth-change-email-btn" class="${AUTH_LINK_BTN}">Usar outro e-mail</button><br />
          <button type="button" id="auth-signout-btn" class="${AUTH_LINK_BTN}">Sair</button>
        </div>
      `
    )
    document.getElementById('auth-change-email-btn').addEventListener('click', () => showSetupEmailScreen(root))
    document.getElementById('auth-signout-btn').addEventListener('click', signOutAndReload)
    return
  }

  root.innerHTML = authShellHtml(
    'Primeiro acesso',
    'Cadastre o seu e-mail. Ele será o seu novo login e é para onde enviamos o link de recuperação de senha.',
    `
      <form id="auth-setup-email-form" class="space-y-3">
        <input name="email" type="email" autocomplete="email" required placeholder="Seu e-mail" class="${AUTH_INPUT_CLASS}" />
        <div data-auth-error></div>
        <button type="submit" class="${AUTH_PRIMARY_BTN}">Enviar link de confirmação</button>
        <div class="text-center"><button type="button" id="auth-signout-btn" class="${AUTH_LINK_BTN}">Sair</button></div>
      </form>
    `
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
