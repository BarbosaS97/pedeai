// config.js
//
// Configuração pública do PapeiAI, versionada no repositório.
//
// A anon key do Supabase é segura para expor no frontend — a segurança real
// vem das políticas de RLS (ver supabase/migrations). Já a service_role key,
// a chave da DeepSeek e a senha do admin (SENHA_ADMIN) NUNCA ficam aqui:
// existem só como secrets dentro das Edge Functions (supabase/functions),
// que rodam no servidor do Supabase.
window.PEDEAI_CONFIG = {
  SUPABASE_URL: 'https://thwnhgpjysykkoblbtrd.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRod25oZ3BqeXN5a2tvYmxidHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjU3NzksImV4cCI6MjEwNDY0MTc3OX0.sngg8z_ZUgpw3YixJ6y74qMaNLVGPeJ0e3Tlh7EY_TI',

  // URL base pública onde este site está hospedado (a raiz do projeto, onde
  // ficam as pastas admin/, restaurante/ e cliente/), usada para montar os
  // links de cardápio e painel — ex: 'https://papeiai.app/'. Deixe em branco
  // para usar automaticamente a URL onde a página está rodando agora
  // (funciona direto com o Live Server, em localhost, ou em qualquer
  // hospedagem).
  APP_URL: '',
}
