# Módulo Clientes (área Comercial) — cadastro, escopo hierárquico e import do legado

> Plano de implementação registrado em 2026-07-23. Ainda não implementado — serve como referência para quando a implementação começar.

## Contexto

O módulo de Clientes existiu antes e foi removido por completo (commit `12dfa9e`). Agora ele volta, desta vez com uma regra de negócio nova: a listagem/edição de Clientes precisa respeitar quem está logado — um Vendedor só vê a própria carteira, um Supervisor vê a carteira do seu time, um Gerente vê a carteira de todos os supervisores/vendedores abaixo dele, e Administrador/Administrativo veem tudo da(s) empresa(s) que têm acesso.

O ponto de partida é o cadastro de `Vendedor` (módulo já commitado em `e0b8747`, com hierarquia por `supervisorId`/`gerenteId` e link opcional `usuarioId` para o usuário de login). **Instrução explícita: não alterar o módulo `vendedores` nem qualquer outro módulo existente** — só a relação reversa `clientes Cliente[]` (exigida pelo Prisma para o novo FK funcionar, zero SQL gerado, zero mudança de comportamento) é tocada em `Vendedor`/`Empresa`.

Limitação conhecida e assumida: o schema de `Vendedor` só modela 2 níveis fixos de hierarquia (`supervisorId`, `gerenteId`) — não existe `diretorId`. Como não vamos alterar `Vendedor`, **"Diretor" é tratado como acesso total à empresa** (mesmo comportamento de Administrador/Administrativo), até que uma iniciativa futura estenda a hierarquia de Vendedor.

Depois do CRUD, os ~6.635 registros da tabela `cliente` do MySQL legado (`rcgdistc_portal`, container docker `plataforma-comercial-dev-mysql-1`, porta 3307) serão importados via conexão direta `mysql2` em runtime (decisão do usuário — não usar o padrão antigo de `.jsonl` de `import-legado.ts`). O modelo de dados usa `codigoErp` como chave natural de upsert por ser reexecutável — isso também deixa o terreno pronto para a API externa de manutenção de Clientes que está planejada "na mesma ideia" da de Vendedor (não desenhada aqui, fora de escopo).

## Fase 1 — Modelo de dados (Prisma)

Adicionar em `apps/api/prisma/schema.prisma`, na seção "Organização comercial", logo após `model Vendedor`:

```prisma
enum TipoPessoa {
  fisica
  juridica
}

model Cliente {
  id         String      @id @default(uuid())
  empresaId  String
  vendedorId String?
  codigoErp  String?

  tipoPessoa         TipoPessoa @default(juridica)
  razaoSocial        String
  nomeFantasia       String?
  cnpjCpf            String?
  inscricaoEstadual  String?
  inscricaoMunicipal String?
  contribuinteIcms   Boolean?
  rg                 String?
  dataNascimento     DateTime?

  contato   String?
  email     String?
  telefone  String?
  telefone2 String?
  celular   String?

  endereco    String?
  complemento String?
  bairro      String?
  municipio   String?
  uf          String?
  cep         String?
  latitude    Float?
  longitude   Float?

  ativo            Boolean @default(true)
  carteira         Boolean?
  site             String?
  limiteCredito    Float?
  vencimentoLimite DateTime?
  observacao       String?

  dataBloqueio         DateTime?
  observacaoBloqueio   String?
  dataReativacao       DateTime?
  observacaoReativacao String?

  primeiraCompra    DateTime?
  ultimaVisita      DateTime?
  ultimaCompra      DateTime?
  ultimoAtendimento DateTime?
  dataConsultaRfb   DateTime?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?
  deletedBy String?

  empresa  Empresa   @relation(fields: [empresaId], references: [id])
  vendedor Vendedor? @relation(fields: [vendedorId], references: [id])

  @@unique([empresaId, codigoErp])
  @@index([empresaId, razaoSocial])
  @@index([empresaId, vendedorId])
  @@map("clientes")
}
```

Único toque em `Vendedor`/`Empresa` (linha nova de relação reversa, sem alterar mais nada — não gera SQL):
```prisma
model Empresa  { ... vendedores Vendedor[]; clientes Cliente[] }   // linha nova
model Vendedor { ... gerenciados Vendedor[] @relation("VendedorGerente"); clientes Cliente[] }  // linha nova
```

### Mapeamento de campos (legado MySQL `cliente` → `Cliente`)

Migrados 1:1 (renomeados para camelCase): `cod_erp→codigoErp`, `status→ativo` (`!== 'B'`), `tipo→tipoPessoa` (`F→fisica`/`J→juridica`), `razao→razaoSocial`, `fantasia→nomeFantasia`, `endereco/complemento/bairro/uf/municipio/cep→` iguais, `telefone1→telefone`, `telefone2`, `celular`, `contato`, `cnpj_cpf→cnpjCpf`, `ie→inscricaoEstadual`, `im→inscricaoMunicipal`, `contribuinte→contribuinteIcms` (`S/N→bool`), `rg`, `nascimento→dataNascimento`, `email`, `vendedor_id→vendedorId` (resolvido no import), `primeira_compra/ultima_visita/ultima_compra/ultimo_atendimento→` iguais em camelCase, `site`, `limite→limiteCredito`, `vencimento_limite→vencimentoLimite`, `carteira` (`S/N→bool`, valor sujo `'1'`→null), `obs→observacao`, `latitude/longitude`, `obs_bloqueio/dt_bloqueio/dt_reativacao/obs_reativacao→` camelCase, `data_rfb→dataConsultaRfb`.

Excluídos conscientemente (sem model/lookup correspondente no sistema novo, ou baixo valor): `filial_id`/`filial_cadastro`/`system_unit_id` (só resolvem `empresaId` no import), `tipo_cliente_id`, `municipio_id`, `seguimento_id`, `regiao_cliente_id`, `situacao_cadastral_id`, `motivo_bloqueio`/`motivo_bloqueio_id`, `celular2`, `fax`, `condicao_pagamento_id`, `tabela_preco_id` (sem model no sistema novo), `sinc`, `log_int`, `destaca_ie`, `data_cadastro`/`dt_alteracao`/`dt_inclusao` (substituídos por `createdAt`/`updatedAt` próprios), `risco` (sempre `NULL`), `reg_ativo`, `dt_revisao`, `cliente` (char, semântica não confirmada). Nenhum bloqueia o v1; podem virar campos de texto achatado depois se algum lookup se mostrar necessário.

### Migration

Gerar via `pnpm --filter @plataforma/api prisma migrate dev --name cliente` (nome de pasta seguirá timestamp automático, depois de `20260723184752_vendedor_remove_celular`). Fechar com o bloco RLS padrão do projeto (ver `apps/api/prisma/migrations/README.md`):
```sql
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_clientes ON "clientes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
```
Não precisa de `GRANT` manual (herdado de `ALTER DEFAULT PRIVILEGES` já existente). Atualizar a lista "Cobertura atual" do `migrations/README.md` incluindo `clientes`.

## Fase 2 — Contracts (`packages/contracts/src/cliente.ts`, novo arquivo)

Seguir exatamente o padrão de `packages/contracts/src/produto.ts`/`vendedor.ts`: `clienteCreateSchema` (zod), `clienteUpdateSchema = clienteCreateSchema.partial()`, `clienteSchema` (create + `id`/`empresaId`/`auditFieldsSchema`), `clienteQuerySchema = paginationQuerySchema.extend({ ativo, tipoPessoa, uf, vendedorId, carteira })`, mais `CLIENTE_CREATE_EXAMPLE` para o Swagger. Registrar `export * from "./cliente";` em `packages/contracts/src/index.ts`.

## Fase 3 — Backend (`apps/api/src/modules/clientes/`, tudo novo)

Arquivos: `clientes.module.ts`, `clientes.controller.ts`, `clientes.service.ts`, `dto/cliente.dto.ts` — espelhando 1:1 o padrão de `produtos`/`vendedores` (guards `JwtAuthGuard`+`PermissionsGuard`, `@RequirePermission('clientes', acao)`, DTOs via `createZodDto`, `PrismaService.withTenant`, soft delete, `SORT_FIELDS` whitelist, helper `limpar()`). **Não importa `VendedoresModule`** — acessa `Vendedor` direto via `tx.vendedor`, mantendo os módulos desacoplados.

### Núcleo: resolução de escopo hierárquico no `ClientesService`

```ts
private async resolverEscopoVendedores(tx: TenantTx, empresaId: string, user: AuthenticatedUser): Promise<string[] | null> {
  if (user.isAdmin) return null; // acesso total (cobre Administrador; "Diretor" tratado igual — ver Contexto)

  const vendedor = await tx.vendedor.findFirst({
    where: { usuarioId: user.id, empresaId, deletedAt: null },
    select: { id: true, supervisor: true, gerente: true },
  });
  if (!vendedor) return null; // sem Vendedor vinculado (ex.: Administrativo) = acesso total

  if (vendedor.gerente) {
    const gerenciados = await tx.vendedor.findMany({ where: { empresaId, gerenteId: vendedor.id, deletedAt: null }, select: { id: true } });
    return [vendedor.id, ...gerenciados.map(v => v.id)];
  }
  if (vendedor.supervisor) {
    const supervisionados = await tx.vendedor.findMany({ where: { empresaId, supervisorId: vendedor.id, deletedAt: null }, select: { id: true } });
    return [vendedor.id, ...supervisionados.map(v => v.id)];
  }
  return [vendedor.id]; // vendedor "puro": só a própria carteira
}
```

Sem CTE recursiva — `supervisorId`/`gerenteId` são campos diretos por linha (não uma cadeia a percorrer), volume é "dezenas de vendedores por empresa", então uma query direta por papel já é suficiente e mais simples de manter.

`escopo === null` → sem restrição. `escopo === string[]` → `where: { vendedorId: { in: escopo } }`. Esse escopo entra em `findAll`/`findOne`/`update`/`remove` sempre combinado com os demais filtros — crítico: **o filtro `?vendedorId=` da query não pode sobrescrever o escopo no mesmo spread** (um usuário restrito poderia tentar vazar dado passando um uuid fora do time). Usar um helper `combinarFiltroVendedor(escopo, vendedorIdQuery)` que, se `vendedorIdQuery` estiver fora do escopo, força resultado vazio em vez de ignorar a restrição. Mesma checagem (`validarVendedorNoEscopo`) no `create`/`update` para impedir atribuir um cliente a um `vendedorId` fora do próprio time (senão 403).

Endpoint auxiliar `GET /clientes/vendedores-escopo` (declarado **antes** de `GET /clientes/:id`, senão o Nest tenta casar como `:id`) retorna `{ data: Vendedor[], restrito: boolean }` — vendedores dentro do escopo do usuário logado, para alimentar o filtro "Vendedor" da tela e o Select do formulário sem expor `VendedoresController` (que não tem essa restrição).

Registrar `ClientesModule` em `apps/api/src/app.module.ts` (única linha nova nesse arquivo).

## Fase 4 — Frontend (`apps/web`)

Páginas dedicadas (padrão do projeto, sem Dialog/Sheet):
- `apps/web/src/app/(app)/comercial/clientes/page.tsx` — lista, espelhando `produtos/page.tsx`/`vendedores/page.tsx` (`useResourceList`/`useResourceMutations` de `use-resource.ts`, sem hook novo; `EntityTable`, `CrudHeader`, `StatusQuickFilter`, `FiltersPopover`).
- `apps/web/src/app/(app)/comercial/clientes/novo/page.tsx` e `.../[id]/page.tsx` — delegam para `ClienteForm`.
- `apps/web/src/components/crud/cliente-form.tsx` — `react-hook-form` + `zodResolver`, decide create/update pela prop `cliente`, seções: Identificação, Contato, Endereço, Comercial (vendedor/limite/carteira), Bloqueio (secundário, só relevante em edição). Campos de histórico (`primeiraCompra`, `ultimaCompra`, etc.) ficam só leitura/informativos — são preenchidos pelo import, não pelo formulário manual.

Filtro/Select de Vendedor consome `GET /clientes/vendedores-escopo` (não `/vendedores` direto): se `restrito === false`, mostra todas as opções; se `restrito === true` e só 1 opção, omite o filtro (é o próprio usuário); se `restrito === true` e mais de 1, mostra só o time.

Colunas da listagem: Razão social/fantasia, Código ERP, CNPJ/CPF, Município/UF, Vendedor, Contato, Status. Filtros: Tipo de pessoa, UF, Vendedor (condicional), Carteira.

## Fase 5 — Seed/menu (`apps/api/prisma/seed-base.ts`)

Dois ajustes pontuais (arquivo de seed do sistema, não é "outro módulo de negócio"):
1. Em `limparDados()`, adicionar `await prisma.cliente.deleteMany();` antes da limpeza de `vendedor` (mesmo espírito das linhas já existentes ali).
2. Em `bootstrapMenu()`, adicionar em `menuDefs`: `{ id: 'seed-menu-clientes', nome: 'Clientes', rota: '/comercial/clientes', icone: 'users', codigo: 'clientes', moduloId: moduloComercial.id }` — módulo Comercial, ao lado de Produtos. O loop de `perfilPermissao.createMany` já cobre a rotina nova automaticamente para o perfil Administrador.

## Fase 6 — Import via `mysql2` (novo arquivo `apps/api/prisma/import-clientes.ts`)

Arquivo separado de `import-legado.ts` (mecanismo de conexão diferente — mysql2 runtime vs. `.jsonl` — e ciclo de vida diferente: idempotente/reexecutável por upsert, pensando na futura API de manutenção contínua).

- Adicionar `mysql2` em **devDependencies** de `apps/api/package.json` (só usado por script standalone via `ts-node`, nunca importado por `dist/main.js` — mesmo raciocínio de `ts-node` já ser devDependency; mantém a imagem de produção limpa).
- Novas vars em `apps/api/.env.example` (hoje não existe nenhuma var MySQL): `MYSQL_HOST=localhost`, `MYSQL_PORT=3307`, `MYSQL_USER=rcg`, `MYSQL_PASSWORD=rcg`, `MYSQL_DATABASE=rcgdistc_portal` (mesmos valores do serviço `mysql` em `docker/docker-compose.dev.yml`).
- Lógica: conectar via `mysql2/promise`; mapear `filial_id` → alias de `Empresa` (mapa explícito no código, falha alto se aparecer `filial_id` desconhecido — evita mis-tenanteamento silencioso); resolver `cliente.vendedor_id` (legado) → `Vendedor.id` (novo) via join extra na tabela `vendedor` do MySQL (`SELECT id, cod_erp FROM vendedor`, casando por `cod_erp` com `Vendedor.codigoErp` já importado) — **confirmar antes de rodar** que a tabela `vendedor` do MySQL realmente tem colunas `id`/`cod_erp` (não investigada ainda, só `cliente` foi inspecionada); dado o volume (6.635 linhas), não precisa streaming — um único `SELECT *` seguido de upsert em lotes (`Promise.all` em chunks de ~200) é suficiente; `upsert` por `(empresaId, codigoErp)` com fallback `codigoErp = 'LEGADO-' + id` se `cod_erp` vier nulo; replicar o `SELECT set_config('app.current_empresa_id', ...)` manual dentro de `$transaction` (mesmo padrão de `import-legado.ts`, necessário porque o script roda fora do Nest/DI).
- Adicionar script `"import:clientes": "ts-node prisma/import-clientes.ts"` no `package.json`.

## Fase 7 — Verificação ponta a ponta

1. Subir stack dev (`docker compose -f docker/docker-compose.dev.yml up -d postgres redis mysql`, depois `db-init`, depois `api`/`web`) — `db-init` já roda migrate+seed, confirma que a migration `clientes` e o menu novo sobem sem erro.
2. Conferir RLS: `\d clientes` no Postgres deve mostrar a policy `tenant_isolation_clientes` e a FK para `vendedores`.
3. Rodar `DESCRIBE vendedor;` no MySQL legado para confirmar nomes de coluna antes do import.
4. Rodar `pnpm --filter @plataforma/api exec ts-node prisma/import-clientes.ts` (depois do import de Vendedores já ter rodado) e checar `SELECT count(*) FROM clientes;` (~6.635). Rodar de novo e confirmar que não duplica (idempotência via upsert).
5. Testar os papéis via API: Admin (`GET /clientes` retorna tudo), usuário ligado a um Vendedor "puro" (só a própria carteira), a um Supervisor (time), a um Gerente (subordinados). Testar `GET /clientes/vendedores-escopo` em cada papel. Testar `PATCH /clientes/:id` tentando setar `vendedorId` fora do escopo como usuário restrito → deve dar 403.
6. Testar o front em `/comercial/clientes`: listagem, filtros, criar/editar/excluir, item "Clientes" aparecendo no menu Comercial.

## Notas de encerramento (fora de escopo agora)

- **API externa de manutenção de Clientes** (mencionada como já planejada, mesma ideia da de Vendedor): não desenhada aqui por pedido explícito. O modelo já fica pronto para isso (`codigoErp` único por empresa como chave de upsert, campos de auditoria padrão) — a integração futura deve reaproveitar `ClientesService.create`/`update`, sem precisar de migration nova.
- Campos excluídos do mapeamento (`tipo_cliente_id`, `municipio_id`, `seguimento_id`, `regiao_cliente_id`, `situacao_cadastral_id`, `motivo_bloqueio`) podem merecer uma spike futura nas tabelas de lookup do MySQL — não bloqueia esta entrega.
- `docs/regras-de-negocio.md` está desatualizado quanto ao módulo Vendedor — vale um follow-up de documentação incluindo a regra de escopo de Clientes e a limitação do "Diretor", mas isso é só documentação, fora do pedido atual.

### Arquivos críticos
- `apps/api/prisma/schema.prisma` (novo `model Cliente` + `enum TipoPessoa` + 2 linhas de relação reversa)
- `packages/contracts/src/cliente.ts` (novo)
- `apps/api/src/modules/clientes/clientes.service.ts` (novo — contém a lógica de escopo)
- `apps/api/src/modules/clientes/clientes.controller.ts` (novo)
- `apps/api/prisma/import-clientes.ts` (novo)
- `apps/api/prisma/seed-base.ts` (2 ajustes pontuais)
- `apps/web/src/components/crud/cliente-form.tsx` e `apps/web/src/app/(app)/comercial/clientes/**` (novos)
