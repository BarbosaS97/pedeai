// turnstile.js — widget Cloudflare Turnstile (captcha) dos logins.
//
// Requer config.js (PEDEAI_CONFIG.TURNSTILE_SITE_KEY) e o script do Turnstile
// (https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit,
// async) na página. A site key é PÚBLICA (pode ficar no repositório); o
// secret correspondente existe só no servidor.
//
// Sem site key configurada o widget simplesmente não aparece (útil em
// desenvolvimento local) — e aí o servidor precisa estar sem o secret
// correspondente, senão vai recusar o login.
//
// Uso:
//   const ts = mountTurnstile(containerEl)
//   const token = ts.getToken()   // '' enquanto a verificação não terminou
//   ts.reset()                    // depois de CADA tentativa: o token vale uma vez só
//   ts.remove()

const TURNSTILE_SITE_KEY = (window.PEDEAI_CONFIG && window.PEDEAI_CONFIG.TURNSTILE_SITE_KEY) || ''

function turnstileEnabled() {
  return Boolean(TURNSTILE_SITE_KEY)
}

// O script do Cloudflare é async: espera ele carregar (até ~10 s) antes de
// desenhar o widget. Se não carregar (bloqueador de anúncios, rede), mostra
// um aviso em vez de deixar o login "mudo".
function whenTurnstileReady(callback, onTimeout) {
  let tries = 0
  const timer = setInterval(() => {
    if (window.turnstile) {
      clearInterval(timer)
      callback()
    } else if (++tries > 100) {
      clearInterval(timer)
      onTimeout()
    }
  }, 100)
}

function mountTurnstile(container) {
  const handle = {
    token: '',
    widgetId: null,
    getToken() {
      return handle.token
    },
    reset() {
      handle.token = ''
      if (handle.widgetId !== null && window.turnstile) window.turnstile.reset(handle.widgetId)
    },
    remove() {
      if (handle.widgetId !== null && window.turnstile) window.turnstile.remove(handle.widgetId)
      handle.widgetId = null
    },
  }
  if (!turnstileEnabled() || !container) return handle

  whenTurnstileReady(
    () => {
      if (!container.isConnected) return // a tela já foi trocada
      // Em telas estreitas (card < 300px) o tamanho "flexible" não cabe: usa compact.
      const narrow = container.clientWidth > 0 && container.clientWidth < 300
      handle.widgetId = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
        size: narrow ? 'compact' : 'flexible',
        language: 'pt-br',
        callback: (token) => {
          handle.token = token
        },
        'expired-callback': () => {
          handle.token = ''
        },
        'error-callback': () => {
          handle.token = ''
        },
      })
    },
    () => {
      container.innerHTML =
        '<p class="text-xs text-brand-red">Não foi possível carregar a verificação de segurança. Desative bloqueadores de anúncio para este site e recarregue a página.</p>'
    }
  )
  return handle
}
