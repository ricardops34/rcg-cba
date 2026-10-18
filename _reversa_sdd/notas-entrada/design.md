# notas-entrada — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `notas-entrada`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll(empresaId, query)` | `filtros (`ativo`, `fornecedorId`, `clienteId`, `tipo`, `ano`, `mes`, `search`) + paginação/ordenação` | `lista paginada com `fornecedor`/`cliente` embutidos` | Baixa |
| `findOne(empresaId, user, id)` | `id da nota` | `nota com fornecedor, cliente, condição de pagamento e itens (com produto/armazém)` | Média — ramifica por permissão (§3.1) |

## Fluxo Principal

### 1. 3.1 Duas portas de acesso ao detalhe (`findOne`)

Quem tem `notas-entrada.visualizar` (ou é admin) vê qualquer nota, sem restrição — é a
tela de Compras. Quem chega só por `posicao-cliente.visualizar` (a aba Devoluções da
Posição de Cliente) **não pode** usar o id da nota como chave livre: o `where` é forçado
a `tipo: 'D'` e a `cliente.vendedorId` dentro do escopo de carteira do usuário
(`resolverEscopoVendedores` — mesmo mecanismo usado em `clientes`), ou `cliente: {isNot:
null}` quando o escopo é a carteira inteira (vendedor sem restrição/gerência). O
comentário no código é explícito sobre o motivo: a nota de compra carrega **custo**, e o
id não pode ser a chave que abre esse dado para quem só devia ver a própria devolução.
Coberto por `notas-entrada.service.spec.ts` (3 casos: acesso pleno, escopo restrito,
escopo de carteira inteira).

### 2. 3.2 Sem escopo hierárquico em `findAll`

Comentário explícito no topo do service: compra não tem carteira de vendedor — quem
enxerga a listagem já é recorte de perfil (a migration `perm_compras` restringe a rotina
a Administrador/Diretor). `findAll` não chama `resolverEscopoVendedores`; o único corte é
`empresaId` via RLS/`withTenant`. Difere de `findOne`, que tem a segunda porta de acesso
do §3.1.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`resolverEscopoVendedores (common/escopo)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/notas-entrada` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** whitelist de ordenação; fora da lista cai no default | `apps/api/src/modules/notas-entrada` | 🟢 |
| **Constante Parametrizada `default de ordenação`:** quando `sortBy` não é informado ou não está na whitelist | `apps/api/src/modules/notas-entrada` | 🟢 |

## Estado Interno e Entidades

- **`NotaEntrada`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`NotaEntradaItem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

