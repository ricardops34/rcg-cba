$ErrorActionPreference = "SilentlyContinue"

Write-Host "================================================================================" -ForegroundColor Yellow
Write-Host "Desinstalador do Serviço Windows - BJ.Integrador" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Yellow

# 1. Parar serviço
Write-Host "Parando serviço BJ.Integrador..." -ForegroundColor Yellow
sc.exe stop "BJ.Integrador"
Start-Sleep -Seconds 3

# 2. Remover serviço do SCM
Write-Host "Removendo serviço do SCM..." -ForegroundColor Yellow
sc.exe delete "BJ.Integrador"

# 3. Remover regra de firewall
Write-Host "Removendo regra de firewall..." -ForegroundColor Yellow
Remove-NetFirewallRule -Name "BJ.Integrador.Monitor"

Write-Host "================================================================================" -ForegroundColor Green
Write-Host "Desinstalação concluída com sucesso." -ForegroundColor Green
Write-Host "Nota: As pastas de dados e arquivos de instalação em C:\Servicos\BJ.Integrador foram mantidas." -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green
