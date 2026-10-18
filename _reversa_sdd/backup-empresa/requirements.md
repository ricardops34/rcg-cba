# backup-empresa — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `backup-empresa`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Gera um **pacote zip com a empresa inteira**: os dados de todas as tabelas com
`empresaId` (JSONL para restaurar e CSV para o Excel), os arquivos que esses registros
referenciam, um manifesto e um LEIA-ME. O backup pode ser **manual** (pela plataforma ou
pelo administrador da empresa) ou **agendado** (a cada N dias, guardando os M mais
recentes). O pacote vai para o armazenamento (`backups-empresas/<empresaId>/…zip`, disco
ou MinIO) e é baixado por **link assinado de 5 min**. **Não há restauração
implementada**: o formato está pronto para ela (manifesto com a versão do schema), mas
nenhum código lê o pacote de volta.

## Responsabilidades

- Gera um **pacote zip com a empresa inteira**: os dados de todas as tabelas com
`empresaId` (JSONL para restaurar e CSV para o Excel), os arquivos que esses registros
referenciam, um manifesto e um LEIA-ME. 🟢
- O backup pode ser **manual** (pela plataforma ou
pelo administrador da empresa) ou **agendado** (a cada N dias, guardando os M mais
recentes). 🟢
- O pacote vai para o armazenamento (`backups-empresas/<empresaId>/…zip`, disco
ou MinIO) e é baixado por **link assinado de 5 min**. 🟢
- **Não há restauração
implementada**: o formato está pronto para ela (manifesto com a versão do schema), mas
nenhum código lê o pacote de volta. 🟢

## Regras de Negócio

- **RN-BE-01 (3.1 Catálogo — o que entra (`backup-catalogo.ts`)):** **Regra:** todo model do Prisma com `empresaId` entra, lido do DMMF 🟢
- **RN-BE-02 (3.2 Geração do pacote — `BackupGerador.gerar`):** 1. Zip em `uploads/.tmp/backup-<id>/pacote.zip` (no volume; o `main.ts` dá 404 para 🟢
- **RN-BE-03 (3.3 Ciclo de vida — `BackupEmpresaService`):** **`solicitar`** (manual): `encerrarInterrompidos` (gerando há mais de **6 h** vira 🟢
- **RN-BE-04 (3.4 Agendamento — `BackupEmpresaVarreduraService` + `agendados`):** `setInterval` de **1 h** (primeira passagem 5 min depois do boot), flag `rodando` em 🟢
- **RN-BE-05 (3.5 Achados):** ✅ **Corrigido em fb73c46** (só os prontos contam; falhas anteriores ao pronto saem). Achado original: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /` (todas as empresas (inclusive excluídas) com seus backups) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /config, PATCH /config` (`ativo`, `frequenciaDias` (1–90), `manter` (1–52)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /:empresaId` (gera agora (202, em segundo plano)) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /:empresaId/:id/link` (link de download de 5 min) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `DELETE /:empresaId/:id` (apaga o pacote e o registro) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `Rota` (Permissão) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `GET /backups` (`backups.visualizar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `POST /backups (202)` (`backups.exportar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `GET /backups/:id/link` (`backups.exportar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `DELETE /backups/:id` (`backups.excluir`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/backup-empresa` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/backup-empresa` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/backup-empresa` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "backup-empresa"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "backup-empresa"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `backup-empresa` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/backup-empresa/backup-empresa.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/plataforma-backups.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backups.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-empresa.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-empresa-varredura.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-gerador.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-catalogo.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-serializar.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-catalogo.spec.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-empresa.service.spec.ts` | Componente central | 🟢 |
| `apps/api/src/modules/backup-empresa/backup-gerador.spec.ts` | Componente central | 🟢 |

