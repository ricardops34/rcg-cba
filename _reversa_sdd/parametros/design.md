# parametros — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `parametros`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Permissão` | `Comportamento` | 200 OK |
| `GET /parametros` | ``parametros.visualizar`` | `paginada; busca por chave ou descrição; filtros `ativo`, `tipo`; ordenação só por `parametro`, `tipo`, `ativo`, `createdAt`` | 200 OK |
| `GET /parametros/:id` | ``parametros.visualizar`` | `Result` | 200 OK |
| `POST /parametros` | ``parametros.cadastrar`` | `chave única na empresa (409)` | 200 OK |
| `PATCH /parametros/:id` | ``parametros.editar`` | `senha em branco mantém a atual` | 200 OK |
| `DELETE /parametros/:id` | ``parametros.excluir`` | `soft delete (`ativo=false`)` | 200 OK |

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
- **`common/pagination`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/parametros` | 🟢 |

## Estado Interno e Entidades

- **`ParametroEmpresa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

