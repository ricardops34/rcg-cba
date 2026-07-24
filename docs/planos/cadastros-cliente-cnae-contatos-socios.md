# Cadastros filhos de Cliente — CNAEs, Contatos e Sócios

> Plano de implementação registrado em 2026-07-24. Ainda não implementado — serve
> como referência para quando a implementação começar.

## Contexto

Três coleções filhas do Cliente, espelhando as tabelas `cliente_cnae`,
`cliente_contato` e `cliente_socios` do legado. Fato decisivo levantado na
inspeção: **as três tabelas estão vazias no dump** (0 linhas) — não há carga
legada a importar. Logo, elas nascem sendo preenchidas por:

1. **MinhaReceita** — ao consultar o CNPJ do cliente
   (ver [`enriquecimento-dados-publicos.md`](./enriquecimento-dados-publicos.md)),
   CNAEs e sócios vêm prontos; contatos vêm como sugestão.
2. **API de integração ERP** — opcionalmente aninhados no upsert de cliente
   (ver [`api-integracao-erp.md`](./api-integracao-erp.md)).
3. **Manual** — na própria tela de cliente.

Como são sempre acessados no contexto de um cliente, os endpoints são
**aninhados** sob `/clientes/:clienteId/...` e herdam o **escopo hierárquico**
de Clientes (um vendedor só mexe nos filhos de clientes da própria carteira).

## Fase 1 — Modelo de dados (Prisma)

Adicionar após `model Cliente`. Todos com `empresaId` (RLS), `clienteId`, soft
delete e auditoria padrão.

```prisma
// CNAEs do cliente (principal + secundárias). cnaeId aponta para a tabela
// `cnaes` de referência (populada pelo IBGE). `principal` distingue o CNAE
// fiscal principal das secundárias — o legado (cliente_cnae) não tinha essa
// flag; MinhaReceita tem.
model ClienteCnae {
  id        String  @id @default(uuid())
  empresaId String
  clienteId String
  cnaeId    String
  principal Boolean @default(false)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?
  deletedBy String?

  empresa Empresa @relation(fields: [empresaId], references: [id])
  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  cnae    Cnae    @relation(fields: [cnaeId], references: [id])

  @@unique([clienteId, cnaeId])
  @@index([empresaId, clienteId])
  @@map("cliente_cnaes")
}

// Contatos do cliente. O legado usava FK tipo_contato_id para uma tabela de
// lookup; como ela está sem uso, achatamos em `tipo` texto (ex.: 'comercial',
// 'financeiro', 'geral') — mesmo espírito de categoria/subcategoria achatadas
// no início.
model ClienteContato {
  id        String  @id @default(uuid())
  empresaId String
  clienteId String
  tipo      String?
  nome      String?
  telefone  String?
  email     String?
  ativo     Boolean @default(true)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?
  deletedBy String?

  empresa Empresa @relation(fields: [empresaId], references: [id])
  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)

  @@index([empresaId, clienteId])
  @@map("cliente_contatos")
}

// Sócios (QSA — quadro de sócios e administradores). Campos alinhados ao legado
// cliente_socios e ao retorno `qsa[]` da MinhaReceita.
model ClienteSocio {
  id            String    @id @default(uuid())
  empresaId     String
  clienteId     String
  nome          String?
  tipo          String?   // PF/PJ
  qualificacao  String?   // qualificacao_socio
  cpfCnpj       String?
  dataEntrada   DateTime?
  faixaEtaria   String?
  descricao     String?
  ativo         Boolean   @default(true)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?
  deletedBy String?

  empresa Empresa @relation(fields: [empresaId], references: [id])
  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)

  @@index([empresaId, clienteId])
  @@map("cliente_socios")
}
```

Relações reversas novas: `Cliente { cnaes ClienteCnae[]; contatos ClienteContato[]; socios ClienteSocio[] }`,
`Cnae { clientes ClienteCnae[] }`, `Empresa { ... }`.

### Migration

Gerar e fechar com o bloco RLS padrão nas **três** tabelas
(`tenant_isolation_cliente_cnaes`, `_cliente_contatos`, `_cliente_socios`);
atualizar a "Cobertura atual" do `migrations/README.md`. Sem GRANT manual
(herdado).

### Mapeamento legado (referência, mesmo sem dados hoje)

- `cliente_cnae`: `cnae_id`→`cnaeId` (resolvido via `cnae.cod_erp`),
  `principal` não existe no legado → `false` (ou marcar o 1º como principal se
  vier da MinhaReceita).
- `cliente_contato`: `tipo_contato_id`→`tipo` (achatado por lookup
  `tipo_contato.descricao`), `nome/telefone/email` iguais, `situacao`→`ativo`.
- `cliente_socios`: `nome`, `tipo`, `qualificacao_socio`→`qualificacao`,
  `cpf_cnpj_socio`→`cpfCnpj`, `data_entrada`→`dataEntrada`, `faixa_etaria`,
  `descricao` iguais.

## Fase 2 — Contracts (`packages/contracts/src/`, novos)

`cliente-cnae.ts`, `cliente-contato.ts`, `cliente-socio.ts` no padrão dos
demais: `*CreateSchema`, `*UpdateSchema = create.partial()`, `*Schema`
(create + `id`/`empresaId`/`clienteId`/audit), `*QuerySchema` e
`*_EXAMPLE`/`*_CREATE_EXAMPLE` para o Swagger. Os schemas de create dos filhos
são **reaproveitados** como itens aninhados nos schemas de MinhaReceita e da
integração ERP (uma definição só para as três origens).

## Fase 3 — Backend (aninhado em `ClientesModule`)

Endpoints REST aninhados, todos sob `JwtAuthGuard`+`PermissionsGuard`,
reutilizando a **permissão `clientes`** (quem edita o cliente gere seus filhos —
evita inflar o RBAC com rotinas novas; decisão a confirmar):

```
GET    /clientes/:clienteId/cnaes
POST   /clientes/:clienteId/cnaes
DELETE /clientes/:clienteId/cnaes/:id
GET    /clientes/:clienteId/contatos
POST   /clientes/:clienteId/contatos
PATCH  /clientes/:clienteId/contatos/:id
DELETE /clientes/:clienteId/contatos/:id
GET    /clientes/:clienteId/socios
POST   /clientes/:clienteId/socios
PATCH  /clientes/:clienteId/socios/:id
DELETE /clientes/:clienteId/socios/:id
```

Regra de escopo crítica: **todo acesso valida antes que o `:clienteId` está no
escopo do usuário** — reutiliza `resolverEscopoVendedores` +
`combinarFiltroVendedor` (já extraídos em `common/escopo/`) checando o
`vendedorId` do cliente pai. Um vendedor não lê nem grava filhos de um cliente
fora da carteira (404, como em Clientes). Services herdam `withTenant`/RLS e o
helper `limpar()`.

Um `ClienteFilhosService` (ou um service por coleção) concentra o
`garantirClienteNoEscopo(clienteId, user)` para não repetir a checagem.

## Fase 4 — Frontend

No `cliente-form.tsx` (somente em modo edição — precisam de um cliente salvo),
três seções/abas novas:

- **CNAEs**: lista (código + descrição, badge "Principal"); adicionar buscando
  na referência `cnaes`; marcar principal. Muito do conteúdo chega
  pré-preenchido pela consulta de CNPJ.
- **Contatos**: CRUD inline (tipo, nome, telefone, e-mail) — o mais "manual" dos
  três.
- **Sócios**: majoritariamente leitura (vem da MinhaReceita); permite ajuste
  manual.

Botão **"Consultar CNPJ"** no topo do formulário (jurídica): chama
`GET /clientes/consulta-cnpj/:cnpj`, preenche os campos do cliente e popula as
três listas como sugestão; o usuário revisa e salva. O CEP usa
`GET /ceps/consulta/:cep` para autopreencher endereço (ver plano de
enriquecimento).

## Fase 5 — Integração e enriquecimento (pontos de convergência)

- **MinhaReceita**: o mapeamento CNAE/QSA/contatos está no plano de
  enriquecimento; aqui é onde os dados aterrissam (mesmos `*CreateSchema`).
- **API de integração ERP**: `PUT /integracao/clientes` aceita
  `cnaes[]`/`contatos[]`/`socios[]` aninhados; o upsert do cliente substitui o
  conjunto de filhos (soft delete dos que sumiram), como as notas fazem com
  itens. Uma definição de schema, três origens (manual, MinhaReceita, ERP) —
  todas idempotentes.

## Fase 6 — Seed/menu

Não há menu novo (vivem dentro da tela de Cliente). Se a decisão for criar
rotinas próprias (`clientes-cnaes` etc.) em vez de reusar `clientes`, adicioná-las
em `seed-base.ts`; caso contrário, nada a fazer no seed além do que Clientes já
tem.

## Fase 7 — Verificação

1. Migration sobe com RLS nas três tabelas; `\d cliente_cnaes` mostra a policy e
   a FK para `clientes`/`cnaes`.
2. CRUD de cada coleção sob um cliente; escopo: usuário restrito recebe 404 em
   filhos de cliente fora da carteira (criar/ler/editar/excluir).
3. Consulta de CNPJ popula as três listas; salvar persiste; reconsultar não
   duplica (chave `@@unique` no CNAE; contatos/sócios por upsert de conjunto na
   via ERP).
4. Front: abas aparecem só em edição; principal do CNAE destacado.

## Fora de escopo (registrado)

- Tabela de lookup `tipo_contato` (achatada em texto; se virar necessidade,
  promover a cadastro auxiliar depois).
- Histórico de alterações do QSA (guardamos o estado atual, não versões).
- Deduplicação de sócios entre clientes (cada cliente tem seus próprios
  registros; um mesmo CPF em vários clientes não é unificado na v1).

### Arquivos críticos (quando implementar)

- `apps/api/prisma/schema.prisma` (3 models + relações reversas + migration RLS)
- `packages/contracts/src/cliente-cnae.ts` / `cliente-contato.ts` / `cliente-socio.ts`
- `apps/api/src/modules/clientes/**` (controllers/services aninhados + escopo)
- `apps/web/src/components/crud/cliente-form.tsx` (3 seções + botão Consultar CNPJ)
