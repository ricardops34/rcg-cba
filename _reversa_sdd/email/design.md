# email — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `email`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Permissão` | `Comportamento` | 200 OK |
| `GET /email/configuracao` | ``email.visualizar`` | `parâmetros SMTP e interruptores; senha só como `senhaPreenchida`` | 200 OK |
| `PUT /email/configuracao` | ``email.editar`` | `upsert dos parâmetros; a senha só muda quando vem preenchida` | 200 OK |
| `POST /email/teste` | ``email.editar`` | `e-mail de teste **para o próprio usuário**, mesmo com o envio desligado` | 200 OK |
| `GET /email/disponivel` | `só JWT` | `o que a tela pode oferecer (`habilitado`, `documentos`, `boleto`, `cobranca`, `senhaProvisoria`)` | 200 OK |
| `GET /email/modelos` | ``email.visualizar`` | `modelos + identidade visual (padrões do sistema quando vazios)` | 200 OK |
| `PUT /email/modelos` | ``email.editar`` | `grava os modelos` | 200 OK |
| `POST /email/modelos/restaurar` | ``email.editar`` | `volta ao padrão` | 200 OK |
| `POST /email/modelos/teste` | ``email.editar`` | `renderiza o modelo com dados de exemplo e envia (`destinatario` opcional, senão o próprio usuário)` | 200 OK |

## Fluxo Principal

1. **Validação e Contexto:** O endpoint recebe a requisição, valida o DTO com Zod e extrai o tenant ativo (`empresaId`) via context / token JWT. 🟢
2. **Execução de Regra de Negócio:** O serviço executa as operações necessárias com validação de permissões e integridade. 🟢
3. **Persistência Relacional:** O PrismaService persiste ou consulta os dados no Postgres aplicando o isolamento RLS. 🟢
4. **Retorno Formatado:** A resposta é serializada e devolvida ao consumidor. 🟢

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`MailService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/mail/*`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `Parâmetro`:** Padrão | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `EMAIL_ATIVO`:** `true` | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `SMTP_HOST, SMTP_PORTA, SMTP_SEGURO, SMTP_USUARIO, SMTP_SENHA (senha), SMTP_REMETENTE`:** vazio (porta 587 no envio; `SEGURO` false) | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `EMAIL_DOCUMENTOS, EMAIL_BOLETO, EMAIL_COBRANCA, EMAIL_SENHA_PROVISORIA`:** `true` | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `EMAIL_MODELO_{COBRANCA,NOTA,BOLETO}_{ASSUNTO,TEXTO}`:** padrão do sistema (`EMAIL_MODELOS_PADRAO`) | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `EMAIL_COR_CABECALHO`:** — | `apps/api/src/modules/email` | 🟢 |
| **Constante Parametrizada `EMAIL_REPLY_TO_USUARIO, EMAIL_ASSINATURA_USUARIO, EMAIL_ASSINATURA_TELEFONE, EMAIL_ASSINATURA_EMAIL`:** `true` | `apps/api/src/modules/email` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

