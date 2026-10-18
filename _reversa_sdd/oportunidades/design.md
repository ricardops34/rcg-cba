# oportunidades — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `oportunidades`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll — GET /oportunidades` | ``oportunidades.visualizar`` | `paginado; filtros `vendedorId` (combinado ao escopo), `clienteId`, `estagio`, `ativo`, `search` (só no **título**, case-insensitive); ordenação por whitelist, padrão `createdAt`` | 200 OK |
| `findOne — GET /oportunidades/:id` | ``oportunidades.visualizar`` | `404 se fora do escopo ou excluída` | 200 OK |
| `create — POST /oportunidades` | ``oportunidades.cadastrar`` | `vendedor e cliente precisam estar no escopo; grava `createdBy`/`updatedBy`` | 200 OK |
| `update — PATCH /oportunidades/:id` | ``oportunidades.editar`` | `a oportunidade precisa estar no escopo; revalida vendedor/cliente **se vierem**` | 200 OK |
| `remove — DELETE /oportunidades/:id` | ``oportunidades.excluir`` | `soft delete: `deletedAt`, `deletedBy`, `ativo=false`` | 200 OK |
| `limpar (privada)` | `—` | ``''` → `null` em todos os campos` | 200 OK |
| `normalizarFechamento (privada)` | `—` | `estágio `ganha`/`perdida` sem `dataFechamento` → `now()`` | 200 OK |
| `garantirVendedorNoEscopo / garantirClienteNoEscopo (privadas)` | `—` | `404 "fora do seu escopo"` | 200 OK |

## Fluxo Principal

### 1. 3.1 Recorte por escopo hierárquico

Todas as rotas resolvem `resolverEscopoVendedores` (`null` = sem restrição; senão a
lista de vendedores do usuário e subordinados). Leitura e escrita aplicam o mesmo
recorte `vendedorId IN escopo` — diferente de `leads`, aqui a escrita **é** recortada.
No `findAll`, `combinarFiltroVendedor` cruza o filtro pedido com o escopo: vendedor
fora do escopo vira `IN []` (lista vazia, não erro).

### 2. 3.2 Cliente precisa ser da carteira do escopo

`garantirClienteNoEscopo`: cliente existe na empresa, não excluído, e — com escopo
restrito — tem `vendedorId` dentro do escopo. Cliente **sem vendedor** fica inacessível
para quem tem escopo restrito. O mesmo padrão aparece em `atividades` e `orcamentos`
(`garantirOportunidadeNoEscopo`), que checam o `vendedorId` da oportunidade.

### 3. 3.3 Data de fechamento automática

Ao gravar com `estagio` `ganha` ou `perdida` e sem `dataFechamento` no payload, o
service usa a data atual. Só olha o **payload**, não o registro.

### 4. 3.4 Uso pelo agente interno

- `registrar_oportunidade`: força `vendedorId` = vendedor do usuário logado
  (`atividades.vendedorDoUsuario`) e valida o cliente com `garantirClienteNoAlcance`.
- `mover_oportunidade`: `garantirOportunidadeNoAlcance` — o vendedor "puro" só mexe na
  própria oportunidade (403); supervisores seguem o escopo do service.
- As duas são ferramentas de escrita com confirmação na tela.

### 5. 3.5 Achados

- 🔴 **"Motivo obrigatório ao marcar como perdida" vive só no prompt e na tela.** O
  contrato aceita `motivoPerda` vazio e o service não exige; o kanban pergunta o motivo,
  mas o formulário e a API gravam `perdida` sem ele. Pela regra "acesso é código,
  comportamento é prompt" isso é comportamento — se a análise de perdas depende do
  motivo, a regra precisa ir para o service/contrato.
- 🟡 **Sair de `ganha`/`perdida` não limpa `dataFechamento` nem `motivoPerda`.**
  Arrastar de volta para `negociacao` no kanban deixa a oportunidade aberta com data de
  fechamento e motivo de perda antigos.
- 🟡 **Fechamento sobrescrito.** Um PATCH que reenvie `estagio: ganha` sem
  `dataFechamento` troca a data de fechamento original pela de hoje.
- 🟡 **Cliente e vendedor podem divergir.** O service só exige que **ambos** estejam no
  escopo; um supervisor pode abrir oportunidade do vendedor A para cliente da carteira
  do vendedor B.
- 🟡 `ativo` e `estagio` são independentes (oportunidade `ganha` e `ativo=true`, ou
  `negociacao` e `ativo=false`); só o soft delete força `ativo=false`.
- 🟡 `valorPrevisto` é `Float` (valor monetário em ponto flutuante).
- 🟡 `search` não procura no nome do cliente.
- 🟡 Excluir não mexe nas atividades/orçamentos vinculados: eles continuam apontando
  para uma oportunidade com `deletedAt`, e o `include` deles ainda mostra o título.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`) — mesmo padrão visto em
  outros módulos.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/oportunidades` | 🟢 |

## Estado Interno e Entidades

- **`Oportunidade`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

