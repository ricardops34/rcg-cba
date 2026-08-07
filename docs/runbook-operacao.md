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

## Armadilha: `pnpm run lint` da API tem `--fix`

`apps/api/package.json` define `"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"`.
Rodar isso reformata o repositório inteiro (já produziu 58 arquivos modificados sem
querer). Para checar sem alterar, lint apenas os arquivos tocados:

```bash
docker exec plataforma-comercial-dev-api-1 sh -c "cd /app/apps/api && pnpm exec eslint <arquivos>"
```

Sempre confira `git diff --stat` depois de qualquer `--fix`.
