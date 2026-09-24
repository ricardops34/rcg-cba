param(
    [string]$DiretorioInstalacao = "C:\Servicos\BJ.Integrador",
    [string]$ServidorSqlConfig = "localhost",
    [string]$BancoSqlConfig = "BJ_INTEGRADOR"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Instalador do Serviço Windows - BJ.Integrador" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$DiretorioPublish = Join-Path $PSScriptRoot "publish"
if (!(Test-Path $DiretorioPublish)) {
    Write-Error "A pasta 'publish' nao foi encontrada em '$DiretorioPublish'. Execute 'dotnet publish' primeiro."
    exit 1
}

# 1. Parar o serviço se estiver rodando
$service = Get-Service -Name "BJ.Integrador" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "Parando servico BJ.Integrador existente..." -ForegroundColor Yellow
    sc.exe stop "BJ.Integrador" | Out-Null
    Start-Sleep -Seconds 3
}

# 2. Criar diretório de instalação se não existir
if (!(Test-Path $DiretorioInstalacao)) {
    New-Item -ItemType Directory -Path $DiretorioInstalacao -Force | Out-Null
}

# 3. Copiar arquivos preservando keys, logs e appsettings em atualizações
Write-Host "Copiando arquivos publicados para '$DiretorioInstalacao'..." -ForegroundColor Green
Get-ChildItem -Path $DiretorioPublish | ForEach-Object {
    $destino = Join-Path $DiretorioInstalacao $_.Name
    if ($_.Name -eq "keys" -or $_.Name -eq "logs") {
        if (!(Test-Path $destino)) {
            Copy-Item -Path $_.FullName -Destination $destino -Recurse -Force
        }
    } elseif ($_.Name -eq "appsettings.json" -and (Test-Path $destino)) {
        Write-Host "Preservando appsettings.json existente." -ForegroundColor Yellow
    } else {
        Copy-Item -Path $_.FullName -Destination $destino -Recurse -Force
    }
}

# 4. Criar / Atualizar regra de Firewall no Windows Server
Write-Host "Configurando regra de firewall para a porta do monitor (TCP 5080)..." -ForegroundColor Green
Remove-NetFirewallRule -Name "BJ.Integrador.Monitor" -ErrorAction SilentlyContinue
New-NetFirewallRule -Name "BJ.Integrador.Monitor" -DisplayName "BJ.Integrador Monitor (HTTP 5080)" -Direction Inbound -Protocol TCP -LocalPort 5080 -Action Allow | Out-Null

# 5. Registrar Serviço Windows
Write-Host "Registrando Serviço Windows no SCM..." -ForegroundColor Green
$exePath = Join-Path $DiretorioInstalacao "BJ.Integrador.Service.exe"
if (!(Test-Path $exePath)) {
    $exePath = Join-Path $DiretorioInstalacao "BJ.Integrador.Service.dll"
}

if ($service) {
    sc.exe config "BJ.Integrador" binPath= "`"$exePath`"" start= delayed-auto DisplayName= "BJ.Integrador - Servico de Integracao" | Out-Null
} else {
    sc.exe create "BJ.Integrador" binPath= "`"$exePath`"" start= delayed-auto DisplayName= "BJ.Integrador - Servico de Integracao" | Out-Null
}

# Configurar ações de recuperação (reiniciar após 1 min nas 3 primeiras falhas)
sc.exe failure "BJ.Integrador" reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null

# 6. Iniciar Serviço
Write-Host "Iniciando servico BJ.Integrador..." -ForegroundColor Green
sc.exe start "BJ.Integrador" | Out-Null

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host "Diretorio: $DiretorioInstalacao" -ForegroundColor Green
Write-Host "Monitor:   http://localhost:5080/monitor" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
