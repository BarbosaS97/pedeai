// supabase-client.js
//
// Requer que config.js e o SDK do Supabase (CDN, UMD) já tenham sido
// carregados antes deste arquivo — ver o <head> de cada página .html.
// O UMD do @supabase/supabase-js expõe o global `supabase`; guardamos o
// client neste projeto em `supabaseClient` para não sobrescrever esse global.

const SUPABASE_URL = window.PEDEAI_CONFIG.SUPABASE_URL
const SUPABASE_ANON_KEY = window.PEDEAI_CONFIG.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY em config.js')
}

// Cliente público: usado no admin/index.html (após o gate de senha) e no
// cardápio público (cliente/index.html).
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Cliente "autenticado por token" para o painel do restaurante
// (restaurante/index.html?token=...). Envia o token como header
// x-restaurant-token, que as policies de RLS (current_restaurant_token(),
// migrations 0002/0003) usam para liberar insert/update/delete apenas nas
// linhas do restaurante dono do token.
function createRestaurantClient(accessToken) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        'x-restaurant-token': accessToken,
      },
    },
  })
}

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
