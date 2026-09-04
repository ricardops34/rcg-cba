# API de Integração ERP — recebimento contínuo de dados do legado

> **Plano histórico, registrado em 2026-07-24 — não é a documentação da API.**
> A integração foi implementada com desenho diferente do descrito aqui: REST
> por recurso (`GET/POST/PATCH/DELETE /integracao/<entidade>/{codigo}`), um
> registro por chamada. O `PUT` em lote com relatório por item que esta página
> propunha foi acrescentado depois, em 2026-09-03, e hoje convive com o CRUD
> individual — ver "Implementado em 2026-09-03" mais abaixo.
>
> **A documentação vigente está em [`../integração/`](../integração/README.md)**
> (conceitos, referência de endpoints e guia do Swagger).

## Contexto

Hoje **não existe** API para receber dados do ERP: toda a carga entra pelos
scripts de import (`import-auxiliares.ts`, `import-legado.ts`,
`import-clientes.ts`, `import-negocio.ts`), que conectam direto no MySQL do
dump e fazem upsert idempotente. Isso funciona para carga inicial, mas não para
manutenção contínua — o objetivo desta API é o ERP **empurrar** as alterações
para a plataforma, aposentando os scripts no dia a dia (eles permanecem como
ferramenta de carga inicial/ressincronização).

O terreno já está pronto de propósito:

- Toda entidade tem chave natural de upsert: `codigoErp` único por empresa nos
  cadastros; `codigoLegado` (id da linha no ERP) nas transacionais
  (`notas_saida`, `notas_saida_itens`, `titulos_receber`).
- Os scripts de import já documentam o mapeamento campo a campo e as conversões
  (S/N→boolean, status→ativo, datas zero→null) — a API usa as mesmas regras.
- O Swagger (`main.ts`) já declara o esquema de segurança `x-api-key`.

## Decisões de desenho (fechadas com o usuário em 2026-07-24)

1. **Autenticação**: API key por empresa, no header `x-api-key`.
2. **Formato**: upsert **em lote** por entidade (`PUT /integracao/<entidade>`),
   com relatório de resultado por item.
3. **Escopo v1**: os dados de **negócio** do ERP — categorias, condições de
   pagamento, armazéns, produtos, vendedores, clientes (com CNAEs/contatos/
   sócios aninhados, ver plano dos cadastros filhos), estoque, notas (com itens)
   e títulos.
4. **Exclusões**: flag `excluido: true` no registro → soft delete
   (`deletedAt`) na plataforma. Sem endpoint DELETE.
5. **Referência geográfica/fiscal NÃO vem do ERP**: estados, municípios, CEPs e
   a tabela-referência de CNAEs deixam de ser empurrados pelo ERP e passam a ser
   alimentados por **APIs públicas** (IBGE, ViaCEP, MinhaReceita) — ver
   [`enriquecimento-dados-publicos.md`](./enriquecimento-dados-publicos.md).
   Países viram seed estático (lista pequena e estável). Por isso essas
   entidades saíram da tabela de endpoints abaixo.
6. **Documentação Swagger completa é requisito de entrega** (não opcional): todo
   endpoint, todo campo de payload e toda resposta documentados — ver a seção
   "Documentação Swagger completa" na Fase 3.

## Fase 1 — Modelo de autenticação (Prisma)

```prisma
// Chave de integração máquina-a-máquina. A chave em claro só é exibida na
// criação; o banco guarda hash SHA-256. `prefixo` (8 primeiros chars) permite
// identificar a chave em tela/log sem expor o segredo.
model IntegracaoApiKey {
  id         String    @id @default(uuid())
  empresaId  String
  nome       String            // ex.: "ERP Protheus - produção"
  chaveHash  String    @unique // sha256 da chave em claro
  prefixo    String            // ex.: "itg_a1b2c3"
  ativo      Boolean   @default(true)
  expiraEm   DateTime?
  ultimoUso  DateTime?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?
  deletedBy String?

  empresa Empresa @relation(fields: [empresaId], references: [id])

  @@index([empresaId])
  @@map("integracao_api_keys")
}
```

**Sem RLS** nesta tabela (exceção documentada no `migrations/README.md`, mesmo
caso de `refresh_tokens`): o guard consulta por `chaveHash` **antes** de existir
contexto de empresa — é a consulta que descobre o tenant.

Formato da chave em claro: `itg_` + 40 chars aleatórios (crypto). O guard faz
`sha256(chave)` e busca por `chaveHash` — nunca se armazena a chave em claro.

## Fase 2 — Guard e módulo base (`apps/api/src/modules/integracao/`)

- `ApiKeyGuard`: lê `x-api-key`, valida hash/ativo/expiração, anexa ao request
  um `IntegracaoContext { empresaId, apiKeyId }` e atualiza `ultimoUso`
  (throttled, ex.: no máximo 1×/min por chave). 401 se ausente/inválida.
- Decorator `@CurrentIntegracao()` (análogo ao `@CurrentUser()`).
- Rate limit dedicado via Throttler (ex.: 60 req/min por chave — lotes de 1.000
  registros tornam isso folgado; ajustável por env).
- Auditoria: `createdBy`/`updatedBy` recebem `integracao:<apiKeyId>` (colunas
  são `String?` sem FK, suportam o formato).
- Swagger: tag `integracao`, security `apiKey` (já declarada no bootstrap).

Os controllers de integração ficam **fora** de `JwtAuthGuard`/`PermissionsGuard`
— autenticação é exclusivamente por API key.

## Fase 3 — Contrato dos endpoints

Base: `PUT /api/v1/integracao/<entidade>` (PUT porque a semântica é upsert
idempotente). Envelope de entrada e resposta iguais para todas as entidades:

```jsonc
// Requisição (máx. 1.000 registros por chamada; acima disso → 400)
{ "registros": [ { /* payload da entidade */ }, ... ] }

// Resposta 200 (o lote nunca "meio-falha" em silêncio: cada item é reportado)
{
  "processados": 1000,
  "criados": 120,
  "atualizados": 870,
  "excluidos": 5,
  "erros": [
    { "indice": 37, "chave": "004417", "mensagem": "vendedorCodigo '000999' não encontrado" }
  ]
}
```

Processamento **por item** (não transacional no lote inteiro): um registro
inválido entra em `erros` e não derruba os demais — mesma filosofia dos
imports. Erros de envelope (JSON inválido, lote grande demais, entidade
desconhecida) → 400 no formato do `AllExceptionsFilter`.

### Entidades e chaves

| Endpoint | Chave de upsert | Referências resolvidas por código |
|---|---|---|
| `PUT /integracao/categorias` | `codigoErp` | `categoriaPaiCodigo` |
| `PUT /integracao/condicoes-pagamento` | `codigoErp` | — |
| `PUT /integracao/armazens` | `codigoErp` | — |
| `PUT /integracao/produtos` | `codigoErp` | `categoriaCodigo`, `subCategoriaCodigo`, `armazemCodigo` |
| `PUT /integracao/vendedores` | `codigoErp` | `supervisorCodigo` |
| `PUT /integracao/clientes` | `codigoErp` | `vendedorCodigo`; aninhados: `cnaes[]` (por `cnaeCodigo`), `contatos[]`, `socios[]` |
| `PUT /integracao/estoque` | `produtoCodigo` + `armazemCodigo` | idem |
| `PUT /integracao/notas-saida` | `codigoLegado` | `clienteCodigo`, `vendedorCodigo`, `condicaoCodigo`, itens: `produtoCodigo` |
| `PUT /integracao/titulos-receber` | `codigoLegado` | `clienteCodigo`, `vendedorCodigo` |

> Estados, municípios, CEPs, CNAEs (tabela-referência) e países **saíram** desta
> lista — passam a ser sincronizados de fontes públicas (IBGE/ViaCEP) ou seed
> estático. O ERP não os empurra mais.

Regras transversais:

- **Referências por código, nunca por uuid**: o ERP não conhece os uuids da
  plataforma. A API resolve `*Codigo` → id interno; referência não encontrada
  → erro no item (não grava com FK nula silenciosamente).
- **Exclusão**: qualquer registro pode vir com `"excluido": true` → soft delete
  (`deletedAt`/`deletedBy`). Reenvio posterior sem a flag **reativa** o
  registro (limpa `deletedAt`) — o ERP é a fonte da verdade.
- **Itens aninhados do ERP** (`notas-saida.itens[]`,
  `tabelas-preco.itens[]`, `orcamentos.itens[]` e
  `regras-desconto.faixas[]`): permanecem no payload do
  cabeçalho. `delete: true` exclui somente o item identificado por seu
  `codigoErp`; a ausência do item no lote não o exclui. Não há endpoints
  separados para itens.
- **Cadastros filhos de cliente** (`clientes.cnaes[]`/`contatos[]`/`socios[]`):
  podem ser preenchidos por
  MinhaReceita (ver plano de enriquecimento); ERP e enriquecimento convivem —
  ambos são upsert idempotente sobre a mesma chave.
- **Empresa da chave**: todo registro grava na empresa dona da API key, via
  `withTenant` (RLS ativa). Não há mais entidade "global" empurrada pelo ERP
  (as globais viraram referência pública/seed).
- **Vendedores**: como no import, `gerente`/`gerenteId`/`usuarioId` nunca são
  tocados pelo ERP (vínculos mantidos manualmente na tela).

### Contracts (`packages/contracts/src/integracao.ts`, novo)

Schemas zod próprios da integração (não reutilizam os `*CreateSchema` das telas
porque as referências são por código e há a flag `excluido`), ex.:

```ts
export const integracaoClienteSchema = clienteCreateSchema
  .omit({ vendedorId: true })
  .extend({
    codigoErp: z.string().trim().min(1).max(30), // obrigatório na integração
    vendedorCodigo: z.string().trim().max(30).nullable().optional(),
    excluido: z.boolean().optional(),
  });
export const integracaoLoteSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ registros: z.array(item).min(1).max(1000) });
```

Campos de histórico (`primeiraCompra`, `ultimaCompra`, ...) **entram** no
schema da integração (diferente do formulário) — é justamente o ERP quem os
mantém.

### Documentação Swagger completa (requisito de entrega)

A API de integração é consumida por um time externo (o pessoal do ERP), então o
Swagger em `/api/docs` é o contrato: precisa estar completo o suficiente para
gerar um client e testar sem ler o código. Regras, todas seguindo o padrão que
já existe em `usuarios`/`perfis` (decorator `ApiBodyExample`, constantes
`*_EXAMPLE` nos contracts):

- **Segurança**: cada controller de integração leva `@ApiSecurity('apiKey')` (o
  esquema `x-api-key` já está registrado em `main.ts` via `.addApiKey`). Vale
  enriquecer a descrição do esquema no `DocumentBuilder` explicando como obter a
  chave (tela de Administração).
- **Agrupamento**: `@ApiTags('integracao')` em todos; um controller por
  entidade mantém o Swagger navegável.
- **Operação**: `@ApiOperation({ summary, description })` por endpoint, deixando
  explícito que é upsert idempotente e que `excluido:true` faz soft delete.
- **Campos documentados um a um**: todo campo dos schemas zod da integração
  recebe `.describe('...')`. O `nestjs-zod` + `cleanupOpenApiDoc` (já no
  `main.ts`) transforma `.describe()` em `description` de cada propriedade no
  OpenAPI — é isso que torna a doc "completa" no nível de campo. Incluir
  unidade/formato onde ajudar (ex.: "data ISO 8601", "S/N no ERP → boolean").
- **Corpo da requisição**: DTO via `createZodDto(integracaoLoteSchema(...))`
  (faz o schema aparecer no Swagger) + `@ApiBodyExample` com um lote realista
  de 2-3 registros, incluindo **um com `excluido:true`**, para o consumidor ver
  o formato de exclusão.
- **Respostas**: `@ApiResponse` para **200** (com `INTEGRACAO_RESULTADO_EXAMPLE`
  — o relatório processados/criados/atualizados/excluidos/erros), **400**
  (envelope inválido, lote > 1.000, entidade desconhecida), **401** (chave
  ausente/inválida/expirada) e **429** (rate limit). Os exemplos de erro seguem
  o formato do `AllExceptionsFilter`.
- **Exemplos de payload por entidade**: constantes `INTEGRACAO_<ENTIDADE>_EXAMPLE`
  em `contracts/src/integracao.ts` (payload com as referências `*Codigo` e, para
  cliente/nota, com os arrays aninhados preenchidos).
- **OpenAPI JSON**: confirmar que `/api/docs-json` serve o documento (o
  `SwaggerModule.setup('api/docs', ...)` já expõe) para o time do ERP gerar o
  client automaticamente.

> Nota: as APIs de **consulta** já entregues (estoque, notas-saída, itens,
> títulos e os CRUDs de cadastros) ganham o mesmo tratamento de resposta —
> as constantes `*_EXAMPLE` de cada entidade já foram criadas nos contracts
> como base; falta apenas referenciá-las nos `@ApiResponse`/`@ApiParam` dos
> controllers. Tratar junto, para o Swagger ficar uniforme.

## Fase 4 — Services de integração

`IntegracaoModule` com um service por entidade (`integracao/clientes/…`,
espelhando a organização de `cadastros/`). Cada service implementa
`upsertLote(empresaId, apiKeyId, registros)`:

1. Pré-carrega os mapas de referência (`codigoErp → id`) numa query por tabela
   referenciada — mesmo padrão dos imports.
2. Processa em chunks (200) dentro de `withTenant`, acumulando o relatório.
3. Upsert pela chave natural; `excluido` → update de `deletedAt`.

Os services de tela **não** são reaproveitados (fazem validação de formulário e
escopo hierárquico de usuário, que não se aplicam aqui); helpers de conversão
(`limpar`, mapeamentos S/N) podem ir para `common/` se houver duplicação real.

## Fase 5 — Gestão de chaves (tela de Administração)

- CRUD mínimo em `/admin/integracao` (rotina `integracao`, módulo
  Administração): listar (nome, prefixo, empresa, último uso, status), criar
  (mostra a chave em claro **uma única vez**), revogar (ativo=false) e excluir.
- Menu/rotina no `seed-base.ts` (o loop de permissões do Admin cobre
  automaticamente).
- Backend: `POST /integracao-keys` etc. sob `JwtAuthGuard`+`PermissionsGuard`
  normais (é tela administrativa, não endpoint de máquina).

## Fase 6 — Verificação

1. Unit: guard (chave válida/inválida/expirada/revogada), resolução de
   referências, flag `excluido`, reativação.
2. E2E com uma chave de teste: lote misto (criar+atualizar+excluir+erro de
   referência) em clientes e notas; conferir relatório e idempotência (reenvio
   → 0 criados).
3. Segurança: chave da empresa A não pode gravar dados que apareçam na empresa
   B (RLS + `withTenant`); endpoint sem chave → 401; rate limit → 429.
4. Carga: lote de 1.000 itens de nota dentro do timeout padrão.
5. **Swagger**: abrir `/api/docs`, conferir que cada endpoint de integração tem
   descrição, exemplo de corpo (com um `excluido:true`), respostas 200/400/401/429
   e todo campo com `description`; baixar `/api/docs-json` e validar que gera um
   client sem erros.
6. Rollout: rodar em paralelo com os scripts por um ciclo (upsert é idempotente,
   os dois caminhos convergem), depois desligar os scripts do dia a dia.

## Fora de escopo (registrado)

- **Pull** (plataforma consultar o ERP) e agendamento — o modelo é só push.
- Webhooks de saída (plataforma → ERP), fila/streaming (Kafka etc.) e
  full-sync com deleção implícita ("o que não veio some") — a exclusão é
  sempre explícita via flag.
- Painel de monitoramento das integrações (fica para quando houver volume real;
  v1 se apoia em `ultimoUso` + logs estruturados do Nest).

### Arquivos críticos (quando implementar)

- `apps/api/prisma/schema.prisma` (model `IntegracaoApiKey` + migration sem RLS, exceção documentada)
- `apps/api/src/modules/integracao/**` (guard, decorator, controllers e services por entidade)
- `packages/contracts/src/integracao.ts` (schemas de lote com referências por código)
- `apps/api/src/modules/integracao-keys/**` + `apps/web/src/app/(app)/admin/integracao/**` (gestão de chaves)
- `apps/api/prisma/seed-base.ts` (menu/rotina `integracao`)

---

## Auditoria de 2026-08-24 — o que existe e o que falta

O que foi implementado até aqui **não é o desenho desta página**: em vez do
upsert em lote (`PUT /integracao/<entidade>` com envelope de registros), a API
nasceu com CRUD individual REST (`POST` / `PATCH` / `DELETE` por código), em 13
entidades — as 9 previstas mais orçamentos, objetivos, regras de desconto e
tabelas de preço. Autenticação, RLS, resolução de referências por código e
auditoria `integracao:<apiKeyId>` estão como o plano previa.

### Corrigido nesta data: reativação de registro excluído

Era um beco sem saída. Depois de um `DELETE`, aquele `codigoErp`/`codigoLegado`
ficava inutilizável para sempre: `POST` respondia 409 (a checagem de
duplicidade não filtrava `deletedAt`) e `PATCH` respondia 404 (a busca filtra
`deletedAt: null`).

Agora vale a regra desta página — **o ERP é a fonte da verdade**: reenviar por
`POST` um registro excluído o **ressuscita** com os dados do payload
(`deletedAt`/`deletedBy` limpos). Registro **ativo** continua devolvendo 409,
como antes. A decisão está centralizada em
`apps/api/src/modules/integracao/common/reativar-excluido.ts`, aplicada nas 13
entidades; nas que têm filhos (notas, orçamentos, objetivos, regras de
desconto, tabelas de preço) os filhos ativos são atualizados e os marcados com
`delete: true` são removidos,
mesma regra do `update`. Orçamento reativado **mantém o número** que já tinha.

Verificado contra a API em execução: criar → excluir → reenviar devolve 201 com
o mesmo `id` e `createdAt`, dados atualizados; e o 409 do registro ativo segue
de pé.

### Implementado em 2026-09-03 — lote, idempotência e exclusão no registro

As pendências 1, 2 e 3 abaixo saíram juntas, porque eram a mesma peça vista de
três ângulos: `PUT /integracao/<entidade>` com `{ registros: [...] }`, até
1.000 por chamada, e `"excluido": true` no próprio registro.

Medido em dev com 1.000 categorias: **6,9 ms por registro**, 1.000 em 6,9 s. A
carga inicial de 119.439 registros cai de **~33 h para ~14 min** em 120
chamadas. O reenvio do mesmo lote devolve `atualizados: 1000` — idempotente,
sem o 409 que obrigava o ERP a saber o estado antes de escolher o verbo.

Duas decisões de desenho que valem registro:

- **O lote não é tudo-ou-nada.** Cada registro roda na própria transação e o
  relatório aponta o índice do que falhou. Numa carga de 1.000 notas, um item
  com `vendedorCodigo` inexistente não pode obrigar a reenviar os outros 999.
- **Sequencial, na ordem recebida.** Paralelizar quebraria a dependência dentro
  do próprio lote (categoria pai antes da filha) e criaria deadlock quando a
  mesma chave aparece duas vezes no mesmo envio, que é comum em
  ressincronização. O ganho já vem de eliminar 119 mil requisições HTTP, não de
  concorrência no banco.

Nenhuma regra de negócio foi reescrita: o lote chama o mesmo `upsert` e o mesmo
`remove` do REST individual, então resolução de referência por código, RLS,
fila de aprovação de cliente e auditoria `integracao:<apiKeyId>` são os mesmos.
Verificado contra a API em execução (11 cenários, incluindo lote misto, erro
parcial, reativação, teto de 1.000 e 401 sem chave); dados de teste apagados
depois.

Segue pendente do plano original: **relatório por item no `GET`** não existe —
o relatório é a resposta da própria chamada, não fica gravado.

### Pendências conhecidas (não implementadas)

1. ~~**Upsert em lote.**~~ Feito em 2026-09-03, ver acima.
2. ~~**Idempotência.**~~ Resolvida pelo `PUT` em lote. O `POST` individual
   segue como está (já era upsert desde 2026-08-24); a assimetria some para
   quem usa o lote.
3. ~~**Flag `excluido: true`**~~ no próprio registro: existe no lote. O
   `DELETE` individual continua para quem trabalha registro a registro.
4. **Coleções filhas de cliente** (CNAEs, contatos, sócios): fora, por
   dependerem de models que ainda não existem.
5. **Throttle fixo** em 60 req/min no código; esta página previa ajustável por
   env.
6. Sem rota de *ping* para o ERP validar a chave sem escrever nada.
