# leads — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `leads`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `listar — GET /leads` | ``leads.visualizar`` | `filtros `situacao`, `temperatura`, busca em nome/empresa informada/interesse; ordem **quente → frio**, e dentro da temperatura **mais antigo primeiro**; `vendedorNome` por linha` | 200 OK |
| `atualizar — PATCH /leads/:id` | ``leads.editar`` | `muda `situacao`, `observacao`, `vendedorId`; avisa o vendedor que recebeu` | 200 OK |
| `distribui(tx, empresa, user, escopo) (privada)` | `—` | `quem "distribui" vê a fila inteira` | 200 OK |
| `avisarVendedor (privada)` | `—` | `notificação `lead_novo` para o usuário do vendedor` | 200 OK |

## Fluxo Principal

### 1. 3.1 Recorte próprio: quem distribui vê tudo

`distribui` = escopo sem restrição (Administrador, Diretor), **ou** usuário sem cadastro de
vendedor, **ou** vendedor com pelo menos um subordinado direto. Quem distribui vê **todos**
os leads da empresa (não só os da equipe); quem não distribui vê só
`vendedorId ∈ escopo`. Justificativa no código: o escopo de carteira esconderia da
supervisão justamente os leads sem dono.

### 2. 3.2 Situação acompanha o dono

No `atualizar`, quando `vendedorId` muda e `situacao` **não** veio no mesmo PATCH:
- entregar a alguém com o lead em `novo` → `em_atendimento`;
- devolver à fila (`vendedorId: null`) com o lead em `em_atendimento` → `novo`
  (corrigido após teste em dev, 2026-09-05: sem isso o lead ficava sem dono e fora da aba
  padrão).
`situacao` explícita sempre ganha. Entregar grava `assumidoPor` (quem entregou, não quem
recebeu) e `assumidoEm`; devolver limpa os dois.

### 3. 3.3 Aviso ao vendedor

Só quando o dono **mudou** para alguém (não na devolução): notificação `lead_novo` com o
título "Lead para você: <empresa informada | nome | telefone>", rota
`/comercial/leads?lead=<id>`. Vendedor sem usuário não recebe (silencioso).

### 4. 3.4 Achados

- 🔴 **`atualizar` não aplica o recorte de `listar`.** Qualquer usuário com `leads.editar`
  — inclusive o vendedor sem equipe, que na lista só vê os próprios — pode, pela API,
  reatribuir, devolver, converter ou descartar **qualquer** lead da empresa conhecendo o
  id. Pela regra do projeto ("acesso é código"), o recorte do `listar` precisa valer
  também na escrita.
- 🔴 **`vendedorId` sem chave estrangeira.** O model `Lead` não declara relação com
  `Vendedor`, e o service não valida o id recebido: aceita vendedor inexistente,
  excluído, desligado ou de **outra empresa**. O lead some da fila (passa a
  `em_atendimento`), ninguém é avisado (`avisarVendedor` não acha o vendedor) e a lista
  mostra `vendedorNome: null`.
- 🟡 `assumidoPor` grava **quem entregou**, não quem recebeu — o nome sugere o contrário.
- 🟡 A supervisão com equipe vê leads de **toda** a empresa, inclusive os entregues a
  vendedores de outra equipe — intencional pelo comentário, mas mais largo que "distribuir".
- 🟡 Sem soft delete em `leads` (não há `deletedAt`); descarte é por `situacao`.
- 🟡 `Promise.all` dentro da transação interativa (`listar`).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`notificacoes/registrar-notificacao`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/leads` | 🟢 |

## Estado Interno e Entidades

- **`Lead`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

