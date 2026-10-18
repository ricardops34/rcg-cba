# documentos-email — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `documentos-email`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Permissão (qualquer uma)` | `Comportamento` | 200 OK |
| `POST /documentos-email/nota/:id` | ``notas-saida.visualizar` ou `posicao-cliente.visualizar`` | ``exigir('documentos')` → `notas.gerarDanfe` (escopo do usuário) → XML opcional → envio → atividade `danfe_email`` | 200 OK |
| `POST /documentos-email/titulo/:id` | ``titulos-receber.visualizar` ou `posicao-cliente.visualizar`` | ``exigir('boleto')` → boleto atualizado ou original → envio → atividade` | 200 OK |
| `POST /documentos-email/cobranca/:clienteId` | ``titulos-receber.visualizar` ou `posicao-cliente.visualizar`` | ``exigir('cobranca')` → até 30 títulos vencidos (escopo do usuário) → boleto atualizado de cada um + DANFE das notas de origem → envio` | 200 OK |

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

- **`MailService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`NotasSaidaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`TitulosReceberService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`EmailConfigService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/atividades/registrar-atividade-documento`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/documentos-email` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

