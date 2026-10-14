# Iniciar Servidor Truco Local no PowerShell
$host.UI.RawUI.WindowTitle = "Servidor Truco Local"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") + ";C:\Program Files\nodejs"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "               SERVIDOR TRUCO LOCAL                     " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERRO] Node.js não foi encontrado no sistema." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Iniciando o servidor Truco Local..." -ForegroundColor Green
Write-Host "Acesse no navegador: " -NoNewline
Write-Host "http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pressione Ctrl + C para encerrar o servidor a qualquer momento." -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot
node server.js
