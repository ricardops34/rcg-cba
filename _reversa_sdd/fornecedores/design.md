# fornecedores — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `fornecedores`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll` | `Listagem paginada com busca (razão social, nome fantasia, CNPJ/CPF, código ERP) e filtros (`ativo`, `uf`)` | `Result` | 200 OK |
| `findOne` | `Detalhe por id, 404 se não encontrado ou excluído` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Sem escopo hierárquico — diferente de Clientes

Comentário explícito no topo do service: fornecedor não tem carteira (não há
`vendedorId`), então não passa pelo `resolverEscopoVendedores` que `clientes` usa. Quem
enxerga a tela já é recorte de perfil (RBAC — só Administrador e Diretor, conforme a
migration `perm_compras` citada no comentário); o isolamento que resta é o de empresa, via
RLS/`withTenant`. Não há lógica de negócio adicional no módulo além de busca/paginação.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/fornecedores` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** whitelist de ordenação | `apps/api/src/modules/fornecedores` | 🟢 |

## Estado Interno e Entidades

- **`Fornecedor`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

