# Swagger — como é montado e como manter

A documentação interativa da API de integração vive em **`/api/docs`**
(`http://localhost:3001/api/docs` em dev). Este arquivo é para quem **mexe no
código** da API: como o documento é gerado, o que entra nele, e o padrão a
seguir ao criar ou alterar um endpoint.

Documentação Swagger completa é **requisito de entrega** desta API, não item
opcional: endpoint novo sem `@ApiOperation`, exemplo de payload e respostas de
erro é entrega incompleta.

---

## Como usar

1. Abra `/api/docs`.
2. Clique em **Authorize** e cole a chave no campo `x-api-key` (o esquema de
   segurança se chama `apiKey`). A chave sai de *Administração > Integração*.
3. Use o **Try it out** de cada rota — as chamadas saem autenticadas e batem no
   ambiente que está servindo a página.

O JSON do OpenAPI fica em **`/api/docs-json`** (padrão do `@nestjs/swagger`) —
é o que se importa no Postman/Insomnia ou se entrega a um gerador de cliente.

---

## O que entra no documento

Só o `IntegracaoModule`:

```ts
// apps/api/src/main.ts
const document = cleanupOpenApiDoc(
  SwaggerModule.createDocument(app, config, { include: [IntegracaoModule] }),
);
SwaggerModule.setup('api/docs', app, document);
```

O `include` é deliberado: as rotas internas do frontend (login, permissões,
cadastros, CRM, WhatsApp, chaves de integração) **não** são documentadas
publicamente. Um controller novo só aparece no Swagger se estiver registrado no
`IntegracaoModule`; se você criou o controller e ele não aparece, é quase sempre
isso.

O `DocumentBuilder` do mesmo arquivo define título, descrição e o esquema de
segurança `apiKey` (header `x-api-key`).

---

## De onde vêm os schemas

Não se escreve schema de campo no controller. O caminho é:

```
packages/contracts/src/integracao.ts   (schema Zod + .describe() + EXAMPLE)
        │  createZodDto(...)
        ▼
apps/api/src/modules/integracao/<entidade>/dto/*.dto.ts
        │  @Body() dto: IntegracaoProdutoCreateDto
        ▼
Swagger  (via cleanupOpenApiDoc, de nestjs-zod)
```

Consequências práticas:

- **O contrato é a fonte única.** O mesmo schema valida a requisição (pelo
  `ZodValidationPipe` global), tipa o service, tipa o frontend e alimenta o
  Swagger. Campo que não está no schema não existe para ninguém.
- **`.describe()` no schema é a descrição do campo na documentação.** Descrever
  um campo é editar o contrato, não o controller:

  ```ts
  categoriaCodigo: z
    .string().trim().max(30).nullable().optional()
    .describe("codigoErp da categoria"),
  ```

- **Exemplos moram no contrato**, com nome em maiúsculas e tipados — o
  compilador acusa quando o exemplo desatualiza em relação ao schema:

  ```ts
  export const INTEGRACAO_PRODUTO_CREATE_EXAMPLE: IntegracaoProdutoCreate = { … };
  export const INTEGRACAO_PRODUTO_EXAMPLE: IntegracaoProduto = { … };
  ```

  Convenção: `INTEGRACAO_<ENTIDADE>_CREATE_EXAMPLE` para o payload de entrada e
  `INTEGRACAO_<ENTIDADE>_EXAMPLE` para a resposta.

---

## Decorators do repositório

Antes de escrever decorator de Swagger na mão, use os que já existem:

| Decorator | Onde | O que faz |
|---|---|---|
| `@ApiBodyExample(EXAMPLE)` | [`common/decorators/api-body-example.decorator.ts`](../../apps/api/src/common/decorators/api-body-example.decorator.ts) | Anexa um exemplo de corpo sem redeclarar o schema (que já vem do ZodDto) |
| `@ApiPaginationQuery()` | [`common/decorators/api-pagination-query.decorator.ts`](../../apps/api/src/common/decorators/api-pagination-query.decorator.ts) | Documenta `page`, `pageSize`, `search`, `sortBy`, `sortOrder` |
| `@ApiIntegracaoAuthResponses()` | [`integracao/common/api-integracao-responses.decorator.ts`](../../apps/api/src/modules/integracao/common/api-integracao-responses.decorator.ts) | Documenta os `401` e `429` comuns a toda rota de integração — no controller, uma vez, não em cada método |

---

## Padrão de um controller de integração

Cabeçalho, sempre nesta combinação:

```ts
@ApiTags('produtos')                              // uma tag por entidade
@ApiSecurity('apiKey')                            // casa com o DocumentBuilder
@ApiIntegracaoAuthResponses()                     // 401 + 429
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)                           // nunca JwtAuthGuard aqui
@Controller('integracao/produtos')
export class IntegracaoProdutosController {
```

Um método, com tudo o que se espera dele:

```ts
@ApiOperation({
  summary: 'Criar produto',
  description:
    'categoriaCodigo/subCategoriaCodigo/armazemCodigo referenciam os respectivos ' +
    'cadastros pelo codigoErp (precisam já existir).',
})
@ApiBodyExample(INTEGRACAO_PRODUTO_CREATE_EXAMPLE)
@ApiResponse({ status: 201, schema: { example: INTEGRACAO_PRODUTO_EXAMPLE } })
@ApiResponse({ status: 409, description: 'Já existe produto com esse codigoErp' })
@Post()
create(
  @Body() dto: IntegracaoProdutoCreateDto,
  @CurrentIntegracao() integracao: IntegracaoContext,
) {
  return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
}
```

Em rota com parâmetro, documente o que o parâmetro **é** — `codigoErp`,
`codigoLegado`, id interno? — porque isso muda de entidade para entidade:

```ts
@ApiParam({ name: 'codigo', description: 'codigoErp do produto' })
```

---

## Checklist para endpoint novo

1. **Contrato** em `packages/contracts/src/integracao.ts`: schema `Create`,
   `Update` (`.omit({ chave }).partial()`), o de leitura (`.extend` com `id` +
   `auditFieldsSchema`), o `Query` (`paginationQuerySchema.extend`), e os
   `EXAMPLE` tipados. `.describe()` em todo campo que não seja óbvio.
2. **DTO** em `<entidade>/dto/`, com `createZodDto(schema)`.
3. **Service**: recebe `empresaId` e `apiKeyId`, roda tudo em
   `prisma.withTenant(empresaId, ...)`, grava autoria com
   `autorIntegracao(apiKeyId)` e trata reativação com `deveReativar` +
   `LIMPAR_EXCLUSAO`.
4. **Controller** no padrão acima, com `@ApiOperation`, `@ApiBodyExample`,
   `@ApiResponse` de sucesso **e** de erro (`404`/`409` conforme o caso), e
   `@ApiParam` descrevendo a chave.
5. **Registro** no `IntegracaoModule` (controller *e* service) — sem isso não há
   rota nem documentação.
6. **Documentação em prosa**: se a rota tem comportamento que o Swagger não
   conta sozinho (fila de aprovação, fluxo de duas etapas, substituição de
   coleção), acrescente em [`endpoints.md`](./endpoints.md).
7. **Migration**: tabela nova com `empresaId` exige RLS e policy na mesma
   migration — ver [`apps/api/prisma/migrations/README.md`](../../apps/api/prisma/migrations/README.md).

---

## Conferindo o resultado

Com o container de dev de pé, reinicie a API antes de conferir — o watch não
recarrega mudanças do host de forma confiável:

```bash
docker restart plataforma-comercial-dev-api-1
```

Depois abra `/api/docs` e verifique: a rota apareceu, o exemplo de corpo está
lá, os campos têm descrição, os erros estão documentados.

Para checar apenas se o projeto compila (sem containers de app rodando), veja o
procedimento de build em
[`../runbook-operacao.md`](../runbook-operacao.md#publicar-imagens) — inclusive
a variante por `docker build`, que não publica nada.

---

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| Rota não aparece no Swagger | Controller não registrado no `IntegracaoModule` |
| Campos do corpo aparecem vazios/`object` | Faltou `createZodDto` — o DTO não deriva do schema Zod |
| Campo sem descrição na página | Falta `.describe()` no contrato (não se resolve no controller) |
| Exemplo diverge do payload real | Exemplo declarado sem tipo — tipe com `IntegracaoXCreate` e o compilador cobra |
| `401` em toda chamada do *Try it out* | Não clicou em **Authorize**, ou a chave foi revogada/expirou |
| `429` durante testes | Limite de 60 req/min por IP nas rotas de integração |
