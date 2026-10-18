# perfis — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `perfis`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll(query, user)` | `filtros + paginação` | `perfis visíveis para o ator` | Média — monta `where` combinando `visiveis()` com os filtros |
| `findOne(id, user)` | `id` | `perfil + permissões + rotina inicial, ou 404` | Média — 404 também para perfil de outro grupo (ver 3.2) |
| `create(input, user)` | `dados do perfil` | `perfil criado` | Média — decide o dono (`grupoEconomicoId`) pelo papel do ator |
| `update(id, input, user)` | `campos` | `perfil atualizado` | Baixa — delega a trava a `garantirPodeAlterar` |
| `remove(id, user)` | `id` | `soft delete` | Baixa — recusa perfil `sistemaBase` |
| `updatePermissoes(id, input, user)` | `lista `{rotinaId, acao, permitido}`` | `permissões atualizadas` | Média — upsert em lote + trava de rotina administrativa |
| `visiveis(user) (privado)` | `user` | `filtro Prisma (`Prisma.PerfilWhereInput`)` | Média — ver 3.1 |
| `garantirPodeAlterar(id, user) (privado)` | `id, user` | `perfil ou `ForbiddenException`` | Baixa |
| `grupoDoAtor(user) (privado)` | `user` | `grupo econômico da empresa ativa` | Baixa |

## Fluxo Principal

### 1. 3.1 Visibilidade perfil-da-plataforma × perfil-do-grupo (`visiveis`)

`Perfil` não tem RLS — é lido no login, antes de existir empresa ativa na sessão — então
o corte de visibilidade é feito inteiramente em código, em `visiveis()`:
- Quem **não** é administrador da plataforma vê os perfis da plataforma (`grupoEconomicoId`
  nulo) **exceto** os que têm um homônimo no grupo da empresa ativa — a migration que
  introduziu "perfil por grupo" deu a cada grupo uma cópia dos perfis que ele já usava, e
  mostrar os dois duplicaria a opção "Vendedor", por exemplo.
- Quem **não** é administrador da plataforma também nunca vê perfil com
  `administraPlataforma: true` — não por risco de leitura, mas para nem aparecer como
  opção no select de vínculo de quem não pode concedê-lo (a trava de atribuição em si
  mora em `UsuariosService.garantirPodeAtribuirPerfil`, módulo `usuarios`).
- Administrador da plataforma vê todos os da plataforma, mesmo havendo homônimo no
  grupo — são os que ele administra.

### 2. 3.2 Perfil de outro grupo responde 404 (`findOne`, `garantirPodeAlterar`)

Perfil de um grupo econômico diferente do da empresa ativa não gera 403, gera 404 —
"como se não existisse" (comentário explícito no código). `garantirPodeAlterar` reusa
`findOne` (que já aplica esse filtro) e só adiciona uma segunda trava: perfil da
plataforma (`grupoEconomicoId` nulo) só é alterável por administrador da plataforma,
mesmo que o ator o enxergue na listagem.

### 3. 3.3 Dono do perfil decidido na criação (`create`)

Administrador da plataforma cria sempre com `grupoEconomicoId: null` (perfil-modelo,
disponível a todos os grupos). Qualquer outro ator cria no grupo da empresa ativa — e
se a empresa ativa não pertencer a grupo nenhum, `ForbiddenException`. Não há como criar
perfil com `administraPlataforma: true` por essa rota (o campo nem está em
`PerfilCreate`/`PerfilUpdate` — só seed e migration concedem).

### 4. 3.4 Trava de rotina administrativa fora do perfil base (`updatePermissoes`)

Perfis que não são `sistemaBase` não podem receber permissão (`permitido: true`) para
nenhuma rotina do módulo `seed-modulo-administracao` (constante
`MODULO_ADMINISTRACAO_ID`) — mesmo corte usado em `auth.buildAccessToken` (`rotinaNoAr`,
módulo `auth`) para nunca listar essas rotinas no token de quem não é admin. Aqui a
checagem é preventiva: barra a gravação, não só a exibição.

### 5. 3.5 Upsert em lote de permissões (`updatePermissoes`)

Substitui por upsert (`perfilId_rotinaId_acao` como chave composta) só as combinações
rotina+ação presentes no payload — as demais permissões do perfil permanecem como
estavam (documentado também no Swagger do controller). Não roda em transação: as
chamadas de `upsert` disparam em paralelo via `Promise.all` 🟡 (uma falha no meio deixa
permissões parcialmente gravadas).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`grupoDaEmpresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`Prisma (namespace)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/perfis` | 🟢 |

## Estado Interno e Entidades

- **`Perfil`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`PerfilPermissao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

