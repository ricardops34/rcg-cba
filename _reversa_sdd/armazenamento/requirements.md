# armazenamento — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `armazenamento`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Onde a plataforma guarda arquivos: **em disco** (`apps/api/uploads`, o volume `uploads`)
ou num **S3, o MinIO da VPS**, escolhido **por pasta** (o primeiro segmento da chave).
A **chave é o caminho relativo a `uploads/`** (`whatsapp/<empresaId>/<uuid>.jpg`) e o
endereço gravado no banco continua `/uploads/<chave>`: trocar uma pasta para o S3 não
muda nada no banco nem na tela. O módulo Nest expõe à administração da plataforma a
**situação** do armazenamento, a **cópia disco→S3 em rodadas** e a **varredura de mídia
órfã do WhatsApp**.

## Responsabilidades

- Onde a plataforma guarda arquivos: **em disco** (`apps/api/uploads`, o volume `uploads`)
ou num **S3, o MinIO da VPS**, escolhido **por pasta** (o primeiro segmento da chave). 🟢
- A **chave é o caminho relativo a `uploads/`** (`whatsapp/<empresaId>/<uuid>.jpg`) e o
endereço gravado no banco continua `/uploads/<chave>`: trocar uma pasta para o S3 não
muda nada no banco nem na tela. 🟢
- O módulo Nest expõe à administração da plataforma a
**situação** do armazenamento, a **cópia disco→S3 em rodadas** e a **varredura de mídia
órfã do WhatsApp**. 🟢

## Regras de Negócio

- **RN-ARMA-01 (3.1 A classe `Armazenamento` (núcleo)):** **Singleton por função** (`armazenamento()`), não injeção do Nest, porque quem grava 🟢
- **RN-ARMA-02 (3.2 Servir `/uploads` (middleware do `main.ts`)):** Ordem das conferências: caminho normalizado → `agente/`, `fichas-importacao/` e `.tmp/` 🟢
- **RN-ARMA-03 (3.3 Migração disco → S3 em rodadas — `migrarParaS3(pasta, 200)`):** Só para pasta já configurada no S3. Para cada um dos primeiros 200 arquivos em disco: 🟢
- **RN-ARMA-04 (3.4 Varredura de mídia órfã do WhatsApp — `MidiaOrfaService.varrer`):** Origem dos órfãos: até 2026-10-13 a exclusão do histórico apagava mensagens e deixava os 🟢
- **RN-ARMA-05 (3.5 Achados):** ✅ **Corrigido em 5f8d319** (trava por empresa). Achado original: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /plataforma/armazenamento/situacao` (S3 configurado?, bucket, teste de conexão (`HeadBucket`) e, por pasta do S3, quantos arquivos ainda estão em disco) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /plataforma/armazenamento/migrar {pasta}` (uma rodada de até 200 arquivos do disco para o S3; `pasta` casa `^[a-z0-9-]+$`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /plataforma/armazenamento/midia-orfa {apagar}` (`false` lista os órfãos; `true` apaga) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/armazenamento` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/armazenamento` | 🟢 |
| Configuração | Constante `ARMAZENAMENTO_S3_PASTAS` com valor `vazio` (pastas (1º segmento) que vão para o S3, separadas por vírgula) | `apps/api/src/modules/armazenamento` | 🟢 |
| Configuração | Constante `S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY` com valor `—` (as quatro são obrigatórias para haver S3) | `apps/api/src/modules/armazenamento` | 🟢 |
| Configuração | Constante `S3_ENDPOINT_PUBLICO` com valor `= S3_ENDPOINT` (host do link assinado) | `apps/api/src/modules/armazenamento` | 🟢 |
| Configuração | Constante `VALIDADE_LINK_SEGUNDOS` com valor `3600` (link temporário) | `apps/api/src/modules/armazenamento` | 🟢 |
| Configuração | Constante `AMOSTRA` com valor `20` (nomes devolvidos) | `apps/api/src/modules/armazenamento` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "armazenamento"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "armazenamento"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `armazenamento` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/armazenamento/armazenamento.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/armazenamento/plataforma-armazenamento.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/armazenamento/midia-orfa.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/armazenamento/midia-orfa.service.spec.ts` | Componente central | 🟢 |
| `apps/api/src/modules/armazenamento/../../common/armazenamento/armazenamento.ts` | Componente central | 🟢 |
| `apps/api/src/modules/armazenamento/../../common/armazenamento/armazenamento.spec.ts` | Componente central | 🟢 |

