# demo — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `demo`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Geração controlada de massa de demonstração e limpeza de dados de uma empresa específica. Permite que administradores da plataforma demonstrem o sistema em produção ou homologação com dados realistas, com volume suficiente para dashboards, curva ABC, sugestão de compra e emissão de 2ª via de DANFE e boletos. Também fornece a operação destrutiva e irreversível de "Limpar Base", que expurga todo o dado de negócio preservando estritamente configurações, acessos, credenciais e a trilha de auditoria.

## Responsabilidades

- Geração controlada de massa de demonstração e limpeza de dados de uma empresa específica. 🟢
- Permite que administradores da plataforma demonstrem o sistema em produção ou homologação com dados realistas, com volume suficiente para dashboards, curva ABC, sugestão de compra e emissão de 2ª via de DANFE e boletos. 🟢
- Também fornece a operação destrutiva e irreversível de "Limpar Base", que expurga todo o dado de negócio preservando estritamente configurações, acessos, credenciais e a trilha de auditoria. 🟢

## Regras de Negócio

- **RN-DEMO-01 (3.1 Geração direta no Prisma sem violação de regras temporais (`demo-gerador.ts`)):** O módulo propositalmente não importa nem reutiliza os `Service`s de negócio do sistema (ex.: `NotasSaidaService`, `OrcamentosService`). Ele opera diretamente sobre a transação do Prisma (`Prisma.TransactionClient`). 🟢
- **RN-DEMO-02 (3.2 DANFE e Boletos Reemitíveis com XML estruturado e Módulo 11 (`demo-nfe-xml.ts`)):** A plataforma não armazena PDFs de notas: a 2ª via do DANFE é gerada em tempo de execução a partir do XML gravado em `nota_saida_xml`. Sem XML, a tela de notas não demonstra o recurso de impressão. 🟢
- **RN-DEMO-03 (3.3 Trava em tempo de compilação/teste contra modelos órfãos (`conferirClassificacao`)):** A função `conferirClassificacao()` analisa o metadado `Prisma.dmmf.datamodel.models` em busca de todas as entidades que contenham o campo `empresaId`. 🟢
- **RN-DEMO-04 (3.4 Preservação seletiva de governança e segurança):** A limpeza de base **nunca** apaga: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `POST /empresas/:id/demo/dados` (Administrador da Plataforma) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `DELETE /empresas/:id/demo/dados` (Administrador da Plataforma) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `DELETE /empresas/:id/demo/base` (Administrador da Plataforma) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/demo` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/demo` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/demo` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "demo"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "demo"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `demo` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/demo/demo.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/demo/demo.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/demo/demo.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/demo/demo-gerador.ts` | Componente central | 🟢 |
| `apps/api/src/modules/demo/demo-limpeza.ts` | Componente central | 🟢 |
| `apps/api/src/modules/demo/demo-nfe-xml.ts` | Componente central | 🟢 |
| `apps/api/src/modules/demo/web: components/empresa/demo-dados-empresa.tsx` | Componente central | 🟢 |
| `apps/api/src/modules/demo/script: prisma/demo-dados.ts` | Componente central | 🟢 |

