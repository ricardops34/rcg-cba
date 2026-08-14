# Runbook de operação — deploy, migrations e imports

Fonte única dos comandos operacionais deste projeto. **Antes de rodar (ou sugerir)
qualquer comando de deploy/migration/import, consulte este arquivo.** Comentários
dentro de Dockerfile/compose já se provaram desatualizados e não devem ser tratados
como verdade — se algo aqui divergir deles, este arquivo vence e o comentário deve
ser corrigido.

Cada procedimento abaixo está marcado como **[verificado]** (executado com sucesso e
com a data) ou **[a confirmar]** (ainda não validado neste ambiente).

---

## Onde os scripts moram

| Contexto | Fonte | Como executar |
|---|---|---|
| Repo/dev (bind mount) | `apps/api/prisma/*.ts` | `ts-node` — ver `scripts` do `apps/api/package.json` |
| Imagem buildada (`rcgcba-api`, `rcgcba-importer`) | `apps/api/prisma/dist/*.js` | `node prisma/dist/<script>.js` |

O `outDir` de `prisma/tsconfig.scripts.json` é `./dist` **relativo a
`apps/api/prisma/`** — ou seja, `apps/api/prisma/dist/`, nunca `apps/api/dist/`
(esse último é o build do NestJS). `prisma/dist/` **não existe** no ambiente de dev:
ele só é gerado durante o build da imagem Docker.

## Papéis do banco (vale para todo import/migration)

- **`plataforma`** — dona das tabelas. É quem roda migrations, seed e os scripts de
  import (eles setam o tenant na mão e precisam contornar a RLS).
- **`plataforma_app`** — role de runtime da API: `NOBYPASSRLS`, sem DDL.

Usar `plataforma_app` em import/migration falha (ou, pior, apaga 0 linhas em tabela
com RLS sem erro nenhum). Ver `apps/api/prisma/migrations/README.md`.

---

## Import da base legada (MySQL → Postgres)

Os scripts leem o MySQL legado (`rcgdistc_portal`) e fazem **upsert** por chave
natural — são idempotentes e reexecutáveis.

> **Atenção:** `import-clientes` sobrescreve o cadastro inteiro do cliente com os
> valores do legado. Edições feitas pela tela (telefone, contato, observação,
> vendedor…) voltam ao valor do MySQL. `seed-base` é **destrutivo** — nunca rode
> contra banco com dado real.

### Ordem de dependência

`import-auxiliares` → `import-legado` (vendedores) → `import-tabela-preco` →
`import-clientes` → `import-negocio` → `import-objetivos`

### Dev local **[verificado em 2026-08-07]**

Roda dentro do container de dev, com a role dona e o MySQL do compose de dev:

```bash
docker exec \
  -e DATABASE_URL="postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public" \
  -e MYSQL_HOST=mysql -e MYSQL_PORT=3306 \
  plataforma-comercial-dev-api-1 \
  sh -c "cd /app/apps/api && pnpm exec ts-node prisma/import-clientes.ts"
```

Saída esperada: `Legado: 6626 clientes, 69 vendedores.` / `— rcg: 6626 clientes
gravados (upsert)`.

Sem `MYSQL_HOST`/`MYSQL_PORT` o script cai nos defaults `localhost:3307` (mapeamento
do host, não da rede Docker) e falha com `ECONNREFUSED` — dentro do container
`localhost` é o próprio container.

### VPS **[a confirmar]**

A VPS já tem o MySQL legado rodando com o backup restaurado, e os imports anteriores
já foram executados com sucesso lá.

> **PENDENTE:** registrar aqui o comando exato usado na VPS — de qual container/serviço
> ele roda e quais valores de `MYSQL_HOST`/`MYSQL_PORT`/`DATABASE_URL`. Enquanto isso
> não estiver preenchido, **pergunte** em vez de montar um comando novo.

O `docker/mysql-import.compose.yml` descreve um fluxo alternativo (sobe um MySQL
temporário a partir do dump); ele **não** é necessariamente o fluxo em uso na VPS.

---

## Sync das referências públicas (IBGE) **[verificado em 2026-08-14]**

`prisma/sync-ibge.ts` popula **CNAEs** (subclasses) e completa estados/municípios a
partir das APIs abertas do IBGE. Idempotente e reexecutável; roda com a **role dona**
(faz DDL nenhum, mas escreve em tabelas de referência).

```bash
docker exec \
  -e DATABASE_URL="postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public" \
  plataforma-comercial-dev-api-1 \
  sh -c "cd /app/apps/api && pnpm exec ts-node prisma/sync-ibge.ts"
```

Saída esperada na primeira execução (base vinda do legado):

```
Estados: 27 sincronizados.
Municípios: 5210 atualizados, 361 com código IBGE corrigido, 0 criados.
CNAEs: 1332 subclasses sincronizadas.
```

Numa reexecução, "código IBGE corrigido" e "criados" vão a zero — se não forem, algo
mudou na fonte.

> **Por que existe "código IBGE corrigido":** o `codigo_ibge` que veio do ERP é
> inconfiável (os municípios de SP estavam gravados como `34xxxxx` quando o oficial
> começa em `35`). O script casa por código **e** por nome+UF; casar só por código
> duplicaria 361 cidades já referenciadas por CEPs e clientes.

É pré-requisito do CNAE do cliente (`cliente_cnaes`) e, portanto, da consulta de CNPJ:
sem a referência carregada, os CNAEs voltam da Receita sem `cnaeId` e não podem ser
vinculados.

### Quando rodar

Como **passo de deploy**, uma vez após publicar a imagem — **não** no boot do
container. Dois motivos concretos:

- Leva **~39 s** (medido em 2026-08-14: 5.571 municípios + 1.332 CNAEs). Isso
  entraria no tempo de subida de todo container.
- O `CMD` da imagem encadeia com `&&` (`migrate deploy && node dist/main.js`).
  Um IBGE fora do ar derrubaria a subida da API inteira por causa de uma tabela
  de referência que muda de anos em anos.

Se um dia fizer sentido automatizar no boot, tem de ser tolerante a falha —
algo como `(node prisma/dist/sync-ibge.js || echo 'sync falhou, seguindo')` —
nunca no encadeamento rígido.

Na imagem buildada o script já está compilado: `node prisma/dist/sync-ibge.js`
(a partir de `/app/apps/api`).

### VPS **[a confirmar]**

> **PENDENTE:** registrar o comando exato na VPS (container e `DATABASE_URL`).
> Enquanto isso, **pergunte** em vez de montar um comando novo.

---

## Carga do CNAE dos clientes (MinhaReceita) **[verificado em 2026-08-14]**

`prisma/enrich-cnae.ts` consulta o CNPJ de cada cliente na base pública da
Receita e grava **apenas os CNAEs** (`cliente_cnaes`).

```bash
docker exec \
  -e DATABASE_URL="postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public" \
  plataforma-comercial-dev-api-1 \
  sh -c "cd /app/apps/api && pnpm exec ts-node prisma/enrich-cnae.ts --intervalo=900"
```

Opções: `--empresa=rcg` (padrão), `--todos` (inclui inativos), `--refazer`
(reconsulta quem já tem CNAE), `--limite=N` (amostra), `--intervalo=ms`
(cortesia com o serviço público, padrão 1000).

**Não altera nenhum campo do cadastro** — de propósito. A fila de aprovação
(`cliente_alteracoes`) cobre os campos do cliente, então um lote que mexesse
neles abriria centenas de solicitações de uma vez. Divergência de endereço/razão
social continua sendo tratada cliente a cliente pelo botão "Consultar CNPJ".

É **retomável**: quem já tem CNAE é pulado, então uma interrupção no meio não
obriga a refazer tudo (nem a bater de novo no serviço público). Pré-requisito:
`sync:ibge` rodado — sem a referência não há a que vincular, e o script recusa
começar.

Escala da base atual: 6.626 clientes, dos quais **817** são jurídica + ativa +
CNPJ válido (o alvo padrão). A ~1 req/s, cerca de 15 minutos.

---

## Migrations em produção

A imagem de produção da API aplica as migrations pendentes no boot:

```dockerfile
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
```

Ou seja: publicar a imagem + redeploy no Portainer já aplica. **Depende de o
`DATABASE_URL` do stack ter privilégio de DDL** — se estiver com `plataforma_app`, o
`migrate deploy` falha e, por causa do `&&`, o container não sobe. Nesse caso, aplique
à parte com a role dona:

```bash
docker exec -e DATABASE_URL="postgresql://plataforma:SENHA@HOST:5432/BANCO?schema=public" \
  <container-api> sh -c "cd /app/apps/api && pnpm exec prisma migrate deploy"
```

### Criar migration em dev

`prisma migrate dev` pede reset do banco quando detecta drift, e não roda
não-interativamente. O caminho seguro, sem perder dados:

```bash
# 1. gera o SQL do diff
docker exec plataforma-comercial-dev-api-1 sh -c \
  "cd /app/apps/api && pnpm exec prisma migrate diff \
   --from-url \"postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public\" \
   --to-schema-datamodel ./prisma/schema.prisma --script"

# 2. cria a pasta prisma/migrations/<timestamp>_<nome>/migration.sql com esse SQL
#    (timestamp: docker exec ... date -u +%Y%m%d%H%M%S)

# 3. aplica com a role dona
docker exec -e DATABASE_URL="postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public" \
  plataforma-comercial-dev-api-1 sh -c "cd /app/apps/api && pnpm exec prisma migrate deploy"
```

Tabela nova com `empresaId` **precisa** de RLS na mesma migration — ver
`apps/api/prisma/migrations/README.md`.

---

## Publicar imagens

`publish.ps1` (raiz) builda e **publica no Docker Hub** (`bjsoftware/rcgcba-api` e
`-web`, tag `latest`), depois é preciso redeploy no Portainer.

O script publica a API **antes** de buildar o web — um erro no web deixa o par
desalinhado em produção. Rode os builds antes para pegar erros:

```bash
docker exec plataforma-comercial-dev-web-1 sh -c "cd /app/apps/web && pnpm exec next build"
docker exec plataforma-comercial-dev-api-1 sh -c "cd /app/apps/api && pnpm exec nest build"
```

## Armadilha: cache do Turbopack corrompido derruba o web em dev **[verificado em 2026-08-11]**

Sintoma: **todas** as rotas do web passam a responder **404** em dev — inclusive `/` e
telas que funcionavam —, e o log do container mostra:

```
Persisting failed: Unable to write SST file 00002373.sst
Caused by: ... Out of memory (os error 12)
```

Não é rota faltando nem erro de código: é o cache de build (`apps/web/.next`, que chegou
a 3,5 GB) inutilizado depois de o Turbopack estourar a memória do container. Reiniciar o
container **não** resolve — o cache continua lá. Apagar e subir de novo resolve:

```bash
docker stop plataforma-comercial-dev-web-1
# no host (PowerShell): Remove-Item -Recurse -Force c:\VPS\rcg\apps\web\.next
docker start plataforma-comercial-dev-web-1
```

A primeira compilação depois disso demora (~25 s por rota); é esperado.

## SQL avulso de carga/correção de cadastro (`docs/sql/`)

Ajustes pontuais de cadastro que não são estrutura (ex.: sincronizar os vendedores
com a SA3 do ERP) ficam como script versionado em `docs/sql/`, e **não** como
migration — migration é para schema e para menu/rotina/permissão.

Os scripts são idempotentes (casam pela chave natural, ex.: `empresaId` +
`codigoErp`) e resolvem a empresa por `empresas.alias`, para o mesmo arquivo
servir dev e VPS sem editar UUID.

### Dev local **[verificado em 2026-08-11]**

```bash
docker cp docs/sql/<arquivo>.sql plataforma-comercial-dev-postgres-1:/tmp/carga.sql
docker exec plataforma-comercial-dev-postgres-1 \
  psql -U plataforma -d plataforma_comercial -f /tmp/carga.sql
```

Role `plataforma` (a dona) — `plataforma_app` não passa pela RLS e atualizaria 0
linhas em silêncio. Cada script termina com um SELECT de conferência; confira a
saída antes de dar o trabalho por feito.

### VPS **[a confirmar]**

> **PENDENTE:** registrar aqui como o `psql` é alcançado na VPS (container do
> Postgres ou conexão externa) e qual `DATABASE_URL` usar. Enquanto isso não
> estiver preenchido, **pergunte** em vez de montar um comando novo.

## Armadilha: `pnpm run lint` da API tem `--fix`

`apps/api/package.json` define `"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"`.
Rodar isso reformata o repositório inteiro (já produziu 58 arquivos modificados sem
querer). Para checar sem alterar, lint apenas os arquivos tocados:

```bash
docker exec plataforma-comercial-dev-api-1 sh -c "cd /app/apps/api && pnpm exec eslint <arquivos>"
```

Sempre confira `git diff --stat` depois de qualquer `--fix`.
