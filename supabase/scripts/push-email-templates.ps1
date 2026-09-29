# push-email-templates.ps1
#
# Envia os modelos de e-mail de supabase/templates/ direto pra configuração de
# Auth do projeto (Management API do Supabase) e depois LÊ de volta o que
# ficou gravado — útil quando o editor do Dashboard não parece salvar.
#
# Uso (PowerShell, na raiz do projeto):
#   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'      # token pessoal: Dashboard → Account → Access Tokens
#   .\supabase\scripts\push-email-templates.ps1            # envia e confere
#   .\supabase\scripts\push-email-templates.ps1 -CheckOnly # só mostra o que está gravado
#
# O token dá acesso à sua conta Supabase: use só nesta sessão do terminal,
# não salve em arquivo nem cole em chat/commit. Depois de usar, apague-o em
# Account → Access Tokens.

param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$projectRef = 'thwnhgpjysykkoblbtrd'
$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) { throw 'Defina $env:SUPABASE_ACCESS_TOKEN antes de rodar (veja o topo do arquivo).' }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$uri = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
$headers = @{ Authorization = "Bearer $token" }

$templates = @(
  @{ key = 'email_change'; subject = 'Confirme seu e-mail no PapeiAI'; file = 'email_change.html' },
  @{ key = 'recovery'; subject = 'Redefina sua senha do PapeiAI'; file = 'recovery.html' }
)

if (-not $CheckOnly) {
  $body = @{}
  foreach ($t in $templates) {
    $html = [System.IO.File]::ReadAllText((Join-Path $root "supabase\templates\$($t.file)"), [System.Text.Encoding]::UTF8)
    $body["mailer_subjects_$($t.key)"] = $t.subject
    $body["mailer_templates_$($t.key)_content"] = $html
  }
  $json = $body | ConvertTo-Json -Depth 3
  Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) | Out-Null
  Write-Host 'Modelos enviados. Conferindo o que ficou gravado...' -ForegroundColor Cyan
}

$cfg = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
foreach ($t in $templates) {
  $subject = $cfg."mailer_subjects_$($t.key)"
  $content = [string]$cfg."mailer_templates_$($t.key)_content"
  $preview = if ($content.Length -gt 70) { $content.Substring(0, 70).Replace("`n", ' ') + '...' } else { $content.Replace("`n", ' ') }
  Write-Host ""
  Write-Host "[$($t.key)]" -ForegroundColor Yellow
  Write-Host "  assunto : $subject"
  Write-Host "  tamanho : $($content.Length) caracteres"
  Write-Host "  começa  : $preview"
}
Write-Host ""
Write-Host 'Esperado: "tamanho" em torno de 2900 e "começa" com <table role=...  Se aparecer "Teste", o servidor ainda tem o modelo antigo.'
Write-Host ('SMTP próprio: ' + $cfg.smtp_host + ':' + $cfg.smtp_port + '  remetente: ' + $cfg.smtp_admin_email)
Write-Host ('Secure email change (deve ser false/desligado): mailer_secure_email_change_enabled = ' + $cfg.mailer_secure_email_change_enabled)
