# meus-atendimentos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `meus-atendimentos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Linha do tempo **somente leitura** do que o vendedor logado fez (ou, para quem
supervisiona, do que a equipe fez). Lê **só** a tabela `atividades`, onde os módulos
de atendimento já gravam cada passo como atividade (WhatsApp, documentos, orçamento,
agenda), para não criar uma segunda definição de "atendimento". O service é exportado
e reusado pelo agente interno (ferramenta de resumo dos atendimentos).

## Responsabilidades

- Linha do tempo **somente leitura** do que o vendedor logado fez (ou, para quem
supervisiona, do que a equipe fez). 🟢
- Lê **só** a tabela `atividades`, onde os módulos
de atendimento já gravam cada passo como atividade (WhatsApp, documentos, orçamento,
agenda), para não criar uma segunda definição de "atendimento". 🟢
- O service é exportado
e reusado pelo agente interno (ferramenta de resumo dos atendimentos). 🟢

## Regras de Negócio

- **RN-MA-01 (3.1 Janela de dias):** `dias` conta dias inteiros **incluindo hoje**: `de = hoje − (dias − 1)` às 00:00, 🟢
- **RN-MA-02 (3.2 De quem):** `proprio` (padrão): `vendedorId = proprio` **ou** `createdBy = usuário`. A segunda 🟢
- **RN-MA-03 (3.3 No período):** `dataConclusao` dentro da janela **ou** `createdAt` dentro da janela: um retorno 🟢
- **RN-MA-04 (3.4 `AND` em vez de `OR` na raiz):** Todas as condições compostas entram em `AND`. A versão anterior tinha o escopo num 🟢
- **RN-MA-05 (3.5 Paginação por cursor):** Ordem `createdAt desc, id desc`; busca `limite + 1` linhas, e a linha a mais indica que 🟢
- **RN-MA-06 (3.6 Contadores do topo):** Contam o **período inteiro**, não a página, numa segunda consulta com até 🟢
- **RN-MA-07 (3.7 Categoria pelo título):** | Regra (título em minúsculas) | Categoria | 🟢
- **RN-MA-08 (3.8 Achados):** 🟡 **Categoria por texto livre.** A atividade digitada à mão com "orçamento", 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `resumo — GET /meus-atendimentos` (`meus-atendimentos.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `carteiras (privada)` (—) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `vazio (privada)` (—) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `codificarCursor / decodificarCursor` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `categoriaDoTitulo (exportada)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/meus-atendimentos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/meus-atendimentos` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/meus-atendimentos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "meus-atendimentos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "meus-atendimentos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `meus-atendimentos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/meus-atendimentos/meus-atendimentos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/meus-atendimentos/meus-atendimentos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/meus-atendimentos/meus-atendimentos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/meus-atendimentos/dto/meus-atendimentos.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/meus-atendimentos/meus-atendimentos.categoria.spec.ts` | Componente central | 🟢 |

