# sms — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `sms`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Permissão` | `Comportamento` | 200 OK |
| `POST /sms/titulo/:id` | ``titulos-receber.visualizar` ou alternativa` | `boleto: valor (atualizado se vencido), vencimento e linha digitável` | 200 OK |
| `POST /sms/cobranca/:clienteId` | ``titulos-receber.visualizar` ou alternativa` | `quantidade e total dos vencidos + contato da empresa` | 200 OK |
| `POST /sms/cliente/:clienteId` | ``posicao-cliente.visualizar` ou alternativa` | `mensagem livre` | 200 OK |
| `GET/PUT /sms/configuracao` | ``sms.visualizar/editar`` | `parâmetros, saldo e URL do webhook` | 200 OK |
| `GET /sms/disponivel` | `só JWT` | `o que a tela oferece` | 200 OK |
| `GET /sms/estatisticas, GET /sms/envios` | ``sms.visualizar`` | `por ano/mês; histórico com respostas` | 200 OK |
| `GET /sms/webhook/:empresaId/:segredo` | `**público**, `@SkipThrottle`` | `status e resposta (a iAgente não autentica)` | 200 OK |

## Fluxo Principal

### 1. 3.1 Envio pela tela — `SmsClienteService`

As mesmas regras do e-mail: o destinatário vem **só do cadastro**
(`primeiroCelular(celular, telefone, telefone2)`; sem celular → 409); o documento vem dos
serviços da tela com a carteira de quem pede; todo envio entra no histórico de
atendimento. O cliente é buscado **com o escopo** (`resolverEscopoVendedores`); fora da
carteira → 404. `textoSms` normaliza o texto para SMS.

### 2. 3.2 `SmsService.enviar`

Grava `SmsEnvio` (motivo, celular, mensagem, cliente, vendedor, título, autor), chama a
iAgente com `client_ref` = id do envio, e grava `status`, `provedorId` ou `erro`. A
disponibilidade = `SMS_ATIVO` ∧ token ∧ o interruptor do motivo.

### 3. 3.3 Aviso automático de vencimento

Timer de 30 min, com flag `rodando` para não sobrepor. Três travas:

- **Desligado por padrão** (`SMS_AVISO_VENCIMENTO_ATIVO=false`), por empresa.
- **Só de segunda a sábado, das 8h às 18h**, em Campo Grande (`podeEnviarAgora`).
- **Um aviso de cada tipo por título**, conferido em `sms_envios`
  (`[empresaId, tituloReceberId, motivo]`).

Intervalos, com "hoje" como data civil no fuso da operação:
- **antes**: vence entre hoje e hoje + `SMS_AVISO_DIAS_ANTES` (padrão 2), com a linha
  digitável quando há boleto;
- **depois**: venceu entre hoje − (`DIAS_DEPOIS` + 7) e hoje − `DIAS_DEPOIS` (padrão 3),
  com o valor atualizado.

A tolerância de 7 dias cobre a API fora do ar. Teto de 100 SMS por empresa por passagem.

### 4. 3.4 Webhook

- **Segredo na URL**: `HMAC-SHA256(JWT_ACCESS_SECRET, "sms-webhook:v1:<empresaId>")`,
  32 caracteres em base64url, comparado em tempo constante. `empresaId` precisa ser
  UUID. Errado → 404 sem motivo.
- **Status de entrega**: `codigosms` = id do `SmsEnvio` (`client_ref`) → atualiza
  `status`/`statusEm`. A data vem em "dd/mm/aaaa hh:mm:ss" de Brasília (`-03:00`).
- **Resposta do cliente**: liga ao envio pelo `codigosms`; sem ele (resposta espontânea),
  ao **último envio para o mesmo celular**. Deduplica por (celular, mensagem,
  `recebidaEm`), porque a iAgente repete até 10 vezes. Grava `SmsResposta` e a
  atividade `sms_resposta` no histórico do cliente (sem autor).
- Responde 200 ("OK") a tudo que tenha o segredo certo.

### 5. 3.5 Relatório

`situacaoDoStatus` agrupa os status textuais da iAgente em entregue, falha e pendente;
estatística por ano/mês; envios com as respostas.

### 6. 3.6 Achados

- 🟡 **O segredo do webhook deriva de `JWT_ACCESS_SECRET`.** Trocar a chave do JWT (por
  incidente, por exemplo) muda a URL de todas as empresas e quebra o webhook em silêncio
  até alguém reconfigurar na iAgente. Uma chave vazada do webhook não entrega a do JWT
  (é HMAC), mas os dois segredos ficam acoplados.
- 🟡 **O segredo vai no caminho da URL** (limitação da iAgente) e acaba nos logs de
  acesso.
- 🟡 **Resposta espontânea pelo último envio.** Celular compartilhado por dois clientes
  (o mesmo contador, por exemplo) registra a resposta no histórico de quem recebeu o
  último SMS.
- 🟡 **Deduplicação frágil.** Com a data do webhook ilegível, `recebidaEm = agora`, e
  cada repetição da iAgente vira uma resposta nova.
- 🟡 **`SMS_TOKEN` em texto puro** em `parametros_empresa`, como o `SMTP_SENHA`.
- 🟡 **Trava de concorrência só em memória.** Com duas instâncias da API, as duas
  varrem; a conferência em `sms_envios` não é atômica e pode mandar o mesmo aviso duas
  vezes.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`TitulosReceberService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/horario/horario-trabalho`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/atividades/registrar-atividade-documento`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`iAgente (externo)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/sms` | 🟢 |

## Estado Interno e Entidades

- **`SmsEnvio`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`SmsResposta`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

