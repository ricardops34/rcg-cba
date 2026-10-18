# parametros — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `parametros`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Parâmetros do sistema **por empresa** (chave/valor tipado, tabela
`parametros_empresa`). Duas funções:
- o **CRUD** da tela Administração > Parâmetros;
- a **leitura tipada** para o resto do backend (`obterNumero`, `obterBoolean`,
  `obterTexto`), com valor padrão quando o parâmetro não existe, está inativo ou vazio.

É a fonte de configuração de SMTP, SMS, tabelas de preço, validade do orçamento,
reemissão de boleto, armazém padrão e outras. Não tem rota em `/integracao` de
propósito, com uma exceção: o ERP grava `ULTIMA_COMUNICACAO_ERP` pela rota de
comunicação da integração.

## Responsabilidades

- Parâmetros do sistema **por empresa** (chave/valor tipado, tabela
`parametros_empresa`). 🟢
- Duas funções:
- o **CRUD** da tela Administração > Parâmetros;
- a **leitura tipada** para o resto do backend (`obterNumero`, `obterBoolean`,
  `obterTexto`), com valor padrão quando o parâmetro não existe, está inativo ou vazio. 🟢
- É a fonte de configuração de SMTP, SMS, tabelas de preço, validade do orçamento,
reemissão de boleto, armazém padrão e outras. 🟢
- Não tem rota em `/integracao` de
propósito, com uma exceção: o ERP grava `ULTIMA_COMUNICACAO_ERP` pela rota de
comunicação da integração. 🟢

## Regras de Negócio

- **RN-PARA-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-PARA-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /parametros` (`parametros.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /parametros/:id` (`parametros.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /parametros` (`parametros.cadastrar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `PATCH /parametros/:id` (`parametros.editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `DELETE /parametros/:id` (`parametros.excluir`) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/parametros` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/parametros` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/parametros` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "parametros"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "parametros"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `parametros` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/parametros/parametros.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/parametros/parametros.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/parametros/parametros.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/parametros/dto/parametro.dto.ts` | Componente central | 🟢 |

