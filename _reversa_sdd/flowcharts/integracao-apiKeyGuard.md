# Fluxograma — `ApiKeyGuard.canActivate`

```mermaid
flowchart TD
    A[requisição] --> B{"header x-api-key?"}
    B -- não --> X1[401 chave ausente]
    B -- sim --> C["sha256(chave) → findUnique(chaveHash)"]
    C --> D{"existe, ativo, sem deletedAt?"}
    D -- não --> X2[401 inválida ou revogada]
    D -- sim --> E{"expiraEm &lt; agora?"}
    E -- sim --> X3[401 expirada]
    E -- não --> F["request.integracao = {empresaId, apiKeyId}"]
    F --> G["endpointKey = 1º segmento após /integracao/"]
    G --> H{"endpointKey?"}
    H -- sim --> I["withTenant: integracaoEndpointConfig.findUnique"]
    I --> J{"config.ativo = false?"}
    J -- sim --> X4[403 endpoint desativado]
    J -- não --> K
    H -- não --> K["classifica: envio | comunicação | coleta"]
    K --> L{"último uso &gt; 60 s, ou 1ª coleta/envio?"}
    L -- sim --> M["update ultimoUso/ultimaColeta/ultimoEnvio (fire-and-forget)"]
    L -- não --> N
    M --> N["upsert contador do endpoint (fire-and-forget, warn se falhar)"]
    N --> O[libera]
```

Classificação: **envio** = `orcamentos/pendentes`, `clientes/alteracoes`,
`equipamentos-comodato/alteracoes`, `arquivo/exportar`; **comunicação** = `/integracao/comunicacao`;
**coleta** = POST/PUT/PATCH/DELETE restantes e `arquivo/importar`.
