# email — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `email`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Configuração do e-mail por empresa (Administração > E-mail): servidor SMTP, interruptores
por funcionalidade, modelos de assunto e texto, e identidade visual. **Sem tabela
própria**: tudo vive em `parametros_empresa` (decisão do usuário de 01/10/2026, mesmo
desenho do SMS). O envio em si é do `common/mail` (`MailService`, `layoutEmail`,
`substituirTags`, `smtpDaEmpresa`).

## Responsabilidades

- Configuração do e-mail por empresa (Administração > E-mail): servidor SMTP, interruptores
por funcionalidade, modelos de assunto e texto, e identidade visual. 🟢
- **Sem tabela
própria**: tudo vive em `parametros_empresa` (decisão do usuário de 01/10/2026, mesmo
desenho do SMS). 🟢
- O envio em si é do `common/mail` (`MailService`, `layoutEmail`,
`substituirTags`, `smtpDaEmpresa`). 🟢

## Regras de Negócio

- **RN-EMAI-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-EMAI-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /email/configuracao` (`email.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `PUT /email/configuracao` (`email.editar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /email/teste` (`email.editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /email/disponivel` (só JWT) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /email/modelos` (`email.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `PUT /email/modelos` (`email.editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `POST /email/modelos/restaurar` (`email.editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `POST /email/modelos/teste` (`email.editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/email` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `Parâmetro` com valor `Tipo` (Padrão) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `EMAIL_ATIVO` com valor `booleano` (`true`) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `SMTP_HOST, SMTP_PORTA, SMTP_SEGURO, SMTP_USUARIO, SMTP_SENHA (senha), SMTP_REMETENTE` com valor `—` (vazio (porta 587 no envio; `SEGURO` false)) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `EMAIL_DOCUMENTOS, EMAIL_BOLETO, EMAIL_COBRANCA, EMAIL_SENHA_PROVISORIA` com valor `booleano` (`true`) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `EMAIL_MODELO_{COBRANCA,NOTA,BOLETO}_{ASSUNTO,TEXTO}` com valor `texto 200/2000` (padrão do sistema (`EMAIL_MODELOS_PADRAO`)) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `EMAIL_COR_CABECALHO` com valor `texto 10` (—) | `apps/api/src/modules/email` | 🟢 |
| Configuração | Constante `EMAIL_REPLY_TO_USUARIO, EMAIL_ASSINATURA_USUARIO, EMAIL_ASSINATURA_TELEFONE, EMAIL_ASSINATURA_EMAIL` com valor `booleano` (`true`) | `apps/api/src/modules/email` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "email"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "email"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `email` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/email/email-config.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/email/email-config.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/email/email-config.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/email/email-config.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/email/email-config.service.spec.ts` | Componente central | 🟢 |

