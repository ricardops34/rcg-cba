param(
    [ValidateSet("all", "api", "web", "scripts")]
    [string]$Target = "all",
    [switch]$BuildOnly,
    [switch]$PreflightOnly,
    [switch]$NoCache,
    [string]$CaCertificatePath = $env:PUBLISH_CA_CERT
)

$ErrorActionPreference = "Stop"
$generatedCertificate = $false

function Assert-DockerSuccess {
    param([string]$Stage)

    if ($LASTEXITCODE -ne 0) {
        throw "Falha em '$Stage' (codigo $LASTEXITCODE)."
    }
}

function Export-InterceptingCa {
    $certificate = Get-ChildItem Cert:\CurrentUser\Root, Cert:\LocalMachine\Root -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Subject -like "*Kaspersky Endpoint Security Personal Certification Authority*" -and
            $_.NotAfter -gt (Get-Date)
        } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1

    if (-not $certificate) {
        return $null
    }

    $path = Join-Path ([IO.Path]::GetTempPath()) "rcgcba-npm-ca-$PID.pem"
    $base64 = [Convert]::ToBase64String(
        $certificate.RawData,
        [Base64FormattingOptions]::InsertLineBreaks
    )
    $pem = "-----BEGIN CERTIFICATE-----`n$base64`n-----END CERTIFICATE-----`n"
    [IO.File]::WriteAllText($path, $pem, [Text.UTF8Encoding]::new($false))
    return $path
}

function Invoke-RegistryPreflight {
    param([string]$CertificatePath)

    Write-Host "Verificando acesso seguro ao registry npm..." -ForegroundColor Green
    $dockerArgs = @("run", "--rm")
    if ($CertificatePath) {
        $mount = "type=bind,source=$CertificatePath,target=/tmp/npm-ca.pem,readonly"
        $dockerArgs += @(
            "--mount", $mount,
            "-e", "NODE_EXTRA_CA_CERTS=/tmp/npm-ca.pem"
        )
    }
    $dockerArgs += @(
        "node:20-alpine",
        "npm", "ping",
        "--registry=https://registry.npmjs.org",
        "--fetch-timeout=10000",
        "--fetch-retries=0"
    )

    & docker @dockerArgs
    Assert-DockerSuccess "teste de acesso ao registry npm"
}

function Invoke-ImageBuild {
    param(
        [string]$Label,
        [string]$Dockerfile,
        [string[]]$Images,
        [string[]]$ExtraBuildArgs = @()
    )

    Write-Host "`nFazendo build de $Label..." -ForegroundColor Green
    $dockerArgs = @(
        "build",
        "--progress=plain",
        "-f", $Dockerfile
    )
    foreach ($img in $Images) { $dockerArgs += @("-t", $img) }
    if ($script:CaCertificatePath) {
        $dockerArgs += @(
            "--secret",
            "id=npm_ca,src=$script:CaCertificatePath"
        )
    }
    if ($NoCache) {
        $dockerArgs += "--no-cache"
    }
    $dockerArgs += $ExtraBuildArgs
    $dockerArgs += "."

    & docker @dockerArgs
    Assert-DockerSuccess "build de $Label"

    if (-not $script:BuildOnly) {
        Write-Host "Enviando $Label para o Docker Hub..." -ForegroundColor Green
        foreach ($img in $Images) {
            & docker push $img
            Assert-DockerSuccess "push de $img"
        }
    }
}

try {
    if ($CaCertificatePath) {
        $CaCertificatePath = (Resolve-Path -LiteralPath $CaCertificatePath).Path
    }
    else {
        $CaCertificatePath = Export-InterceptingCa
        $generatedCertificate = [bool]$CaCertificatePath
    }

    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host " Publicacao de imagens no Docker Hub" -ForegroundColor Cyan
    Write-Host " Organizacao: bjsoftware" -ForegroundColor Yellow
    Write-Host " Alvo: $Target" -ForegroundColor Yellow
    if ($BuildOnly) {
        Write-Host " Modo de teste: build local, sem push" -ForegroundColor Yellow
    }
    if ($CaCertificatePath) {
        Write-Host " CA adicional: habilitada como segredo temporario" -ForegroundColor Yellow
    }
    Write-Host "=========================================" -ForegroundColor Cyan

    Invoke-RegistryPreflight $CaCertificatePath

    if ($PreflightOnly) {
        Write-Host "Preflight concluido; nenhum build foi iniciado." -ForegroundColor Green
        return
    }

    # Tag de versao alem de latest: permite voltar a imagem anterior (rollback).
    $versao = Get-Date -Format "yyyy.MM.dd-HHmm"
    # Transicao do nome: publica no nome novo (plataforma-*) e no antigo (rcgcba-*).
    # A stack ainda aponta para o antigo ate a troca ser validada; ver
    # docs/planos/2026-10-27-imagens-docker-nome-e-privacidade.md.
    function Get-ImageTags([string]$Nome) {
        return @(
            "bjsoftware/plataforma-${Nome}:latest", "bjsoftware/plataforma-${Nome}:${versao}",
            "bjsoftware/rcgcba-${Nome}:latest", "bjsoftware/rcgcba-${Nome}:${versao}"
        )
    }

    if ($Target -in @("all", "api")) {
        Invoke-ImageBuild `
            -Label "API" `
            -Dockerfile "docker/api.Dockerfile" `
            -Images (Get-ImageTags "api")
    }

    if ($Target -in @("all", "web")) {
        Invoke-ImageBuild `
            -Label "Web" `
            -Dockerfile "docker/web.Dockerfile" `
            -Images (Get-ImageTags "web") `
            -ExtraBuildArgs @(
                "--build-arg",
                # Relativo, para a imagem servir a qualquer cliente (ver web.Dockerfile).
                "NEXT_PUBLIC_API_URL=/api/v1",
                "--build-arg",
                "NEXT_PUBLIC_APP_VERSION=1.0"
            )
    }

    # Seed e migrations (imagem enxuta); nao entra em "all" porque muda raramente.
    if ($Target -eq "scripts") {
        Invoke-ImageBuild `
            -Label "Scripts" `
            -Dockerfile "docker/api-scripts.Dockerfile" `
            -Images (Get-ImageTags "scripts")
    }

    Write-Host "`n=========================================" -ForegroundColor Cyan
    if ($BuildOnly) {
        Write-Host " Sucesso! Build local concluido; nada foi enviado." -ForegroundColor Green
    }
    else {
        Write-Host " Sucesso! Imagens publicadas (versao $versao)." -ForegroundColor Green
    }
    Write-Host "=========================================" -ForegroundColor Cyan
}
catch {
    Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($generatedCertificate -and $CaCertificatePath -and (Test-Path -LiteralPath $CaCertificatePath)) {
        Remove-Item -LiteralPath $CaCertificatePath -Force
    }
}
