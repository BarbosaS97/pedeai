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

// Cliente único do site: admin (após o gate de senha), cardápio público
// (cliente/index.html) e painel do restaurante (com login).
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Este mesmo client guarda a sessão do Supabase Auth (localStorage): é ele que
// o painel do restaurante usa depois do login (restaurante/auth.js) — a RLS
// reconhece o dono por auth.uid(), ver migration 0015.

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
