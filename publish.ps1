Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Iniciando Publicação no Docker Hub" -ForegroundColor Cyan
Write-Host " Organização: bjsoftware" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan

# Função para checar erros
function Check-Error {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Ocorreu um erro no último comando. Abortando script." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# 1. API
Write-Host "`n[1/3] Fazendo build da API..." -ForegroundColor Green
docker build -f docker/api.Dockerfile -t bjsoftware/rcgcba-api:latest .
Check-Error

Write-Host "Enviando API para o Docker Hub..." -ForegroundColor Green
docker push bjsoftware/rcgcba-api:latest
Check-Error

# 2. Web
Write-Host "`n[2/3] Fazendo build do Web..." -ForegroundColor Green
docker build -f docker/web.Dockerfile -t bjsoftware/rcgcba-web:latest `
  --build-arg NEXT_PUBLIC_API_URL=https://api.rcgcba.bjsoft.com.br/api/v1 .
Check-Error

Write-Host "Enviando Web para o Docker Hub..." -ForegroundColor Green
docker push bjsoftware/rcgcba-web:latest
Check-Error

# 3. WhatsApp worker
# Servico a parte (sessoes de WhatsApp dos vendedores). O stack de producao
# referencia bjsoftware/rcgcba-whatsapp-worker:latest, entao ele precisa ser
# publicado junto com os outros dois.
Write-Host "`n[3/3] Fazendo build do WhatsApp worker..." -ForegroundColor Green
docker build -f docker/whatsapp-worker.Dockerfile -t bjsoftware/rcgcba-whatsapp-worker:latest .
Check-Error

Write-Host "Enviando WhatsApp worker para o Docker Hub..." -ForegroundColor Green
docker push bjsoftware/rcgcba-whatsapp-worker:latest
Check-Error

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host " Sucesso! Imagens publicadas com exito." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
