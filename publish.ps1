param(
    [ValidateSet("all", "api", "web", "worker")]
    [string]$Target = "all",
    [switch]$BuildOnly,
    [switch]$PreflightOnly,
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
        [string]$Image,
        [string[]]$ExtraBuildArgs = @()
    )

    Write-Host "`nFazendo build de $Label..." -ForegroundColor Green
    $dockerArgs = @(
        "build",
        "--progress=plain",
        "-f", $Dockerfile,
        "-t", $Image
    )
    if ($script:CaCertificatePath) {
        $dockerArgs += @(
            "--secret",
            "id=npm_ca,src=$script:CaCertificatePath"
        )
    }
    $dockerArgs += $ExtraBuildArgs
    $dockerArgs += "."

    & docker @dockerArgs
    Assert-DockerSuccess "build de $Label"

    if (-not $script:BuildOnly) {
        Write-Host "Enviando $Label para o Docker Hub..." -ForegroundColor Green
        & docker push $Image
        Assert-DockerSuccess "push de $Label"
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

    if ($Target -in @("all", "api")) {
        Invoke-ImageBuild `
            -Label "API" `
            -Dockerfile "docker/api.Dockerfile" `
            -Image "bjsoftware/rcgcba-api:latest"
    }

    if ($Target -in @("all", "web")) {
        Invoke-ImageBuild `
            -Label "Web" `
            -Dockerfile "docker/web.Dockerfile" `
            -Image "bjsoftware/rcgcba-web:latest" `
            -ExtraBuildArgs @(
                "--build-arg",
                "NEXT_PUBLIC_API_URL=https://api.rcgdist.com.br/api/v1"
            )
    }

    if ($Target -in @("all", "worker")) {
        Invoke-ImageBuild `
            -Label "WhatsApp worker" `
            -Dockerfile "docker/whatsapp-worker.Dockerfile" `
            -Image "bjsoftware/rcgcba-whatsapp-worker:latest"
    }

    Write-Host "`n=========================================" -ForegroundColor Cyan
    if ($BuildOnly) {
        Write-Host " Sucesso! Build local concluido; nada foi enviado." -ForegroundColor Green
    }
    else {
        Write-Host " Sucesso! Imagens publicadas." -ForegroundColor Green
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
