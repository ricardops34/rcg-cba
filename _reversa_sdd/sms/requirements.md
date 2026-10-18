# sms — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `sms`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

SMS ao cliente pelo provedor **iAgente** (`https://api.iagentesms.com.br/api/v2`):
boleto (com a linha digitável, porque SMS não leva anexo), cobrança, mensagem livre,
senha provisória e **aviso automático de vencimento**. Recebe pelo webhook o status de
entrega e as **respostas do cliente**. Tem estatística e histórico. A configuração vive
em parâmetros da empresa, como no e-mail.

## Responsabilidades

- SMS ao cliente pelo provedor **iAgente** (`https://api.iagentesms.com.br/api/v2`):
boleto (com a linha digitável, porque SMS não leva anexo), cobrança, mensagem livre,
senha provisória e **aviso automático de vencimento**. 🟢
- Recebe pelo webhook o status de
entrega e as **respostas do cliente**. 🟢
- Tem estatística e histórico. 🟢
- A configuração vive
em parâmetros da empresa, como no e-mail. 🟢

## Regras de Negócio

- **RN-SMS-01 (3.1 Envio pela tela — `SmsClienteService`):** As mesmas regras do e-mail: o destinatário vem **só do cadastro** 🟢
- **RN-SMS-02 (3.2 `SmsService.enviar`):** Grava `SmsEnvio` (motivo, celular, mensagem, cliente, vendedor, título, autor), chama a 🟢
- **RN-SMS-03 (3.3 Aviso automático de vencimento):** Timer de 30 min, com flag `rodando` para não sobrepor. Três travas: 🟢
- **RN-SMS-04 (3.4 Webhook):** **Segredo na URL**: `HMAC-SHA256(JWT_ACCESS_SECRET, "sms-webhook:v1:<empresaId>")`, 🟢
- **RN-SMS-05 (3.5 Relatório):** `situacaoDoStatus` agrupa os status textuais da iAgente em entregue, falha e pendente; 🟢
- **RN-SMS-06 (3.6 Achados):** 🟡 **O segredo do webhook deriva de `JWT_ACCESS_SECRET`.** Trocar a chave do JWT (por 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `POST /sms/titulo/:id` (`titulos-receber.visualizar` ou alternativa) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /sms/cobranca/:clienteId` (`titulos-receber.visualizar` ou alternativa) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /sms/cliente/:clienteId` (`posicao-cliente.visualizar` ou alternativa) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET/PUT /sms/configuracao` (`sms.visualizar/editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /sms/disponivel` (só JWT) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `GET /sms/estatisticas, GET /sms/envios` (`sms.visualizar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `GET /sms/webhook/:empresaId/:segredo` (**público**, `@SkipThrottle`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/sms` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/sms` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/sms` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "sms"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "sms"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `sms` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/sms/sms.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms-cliente.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms-aviso-vencimento.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms-webhook.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms-relatorio.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sms/sms.spec.ts` | Componente central | 🟢 |

