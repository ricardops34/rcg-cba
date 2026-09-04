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
| Imagem buildada (`rcgcba-api`, `rcgcba-scripts`) | `apps/api/prisma/dist/*.js` | `node prisma/dist/<script>.js` |

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

## Criar uma base do zero **[verificado em 2026-08-28]**

Três passos, nesta ordem. O import do MySQL legado **não existe mais** — a base
nasce vazia e é populada por migration, seed e APIs públicas.

```bash
# 1. Estrutura: a baseline única (tabelas + role plataforma_app + RLS)
pnpm --filter @plataforma/api prisma:deploy

# 2. Conteúdo: menus, rotinas, perfis, parâmetros, empresa inicial, admin —
#    e, no fim, as referências públicas (países, UFs, municípios, CNAEs)
pnpm --filter @plataforma/api prisma:seed
```

O seed é **destrutivo**: apaga os dados de negócio antes de popular. Nunca rode
contra banco com dado real.

A carga das referências é a última etapa do seed **de propósito**: ela depende de
rede (APIs do IBGE), e uma falha ali não pode impedir o admin e a empresa de
existirem. Se cair, o seed avisa no console e o `sync:ibge` completa depois.

Números esperados numa base nova: 1 empresa, 1 admin, 5 perfis, 46 rotinas,
20 parâmetros, 193 países, 27 UFs, 5.571 municípios, 1.332 CNAEs.

`ceps` nasce vazia por desenho — os CEPs entram sob demanda, pelo ViaCEP, quando
um cliente é consultado.

> **Produção:** o histórico de migrations foi consolidado numa baseline única em
> 2026-08-28. Um banco que já rodou as migrations antigas **recusa** o
> `migrate deploy` (o Prisma confere o checksum de cada uma) — precisa ser
> recriado do zero. Ver `apps/api/prisma/migrations/README.md`.

---

## Sync das referências públicas (IBGE) **[verificado em 2026-08-14]**

O seed já faz esta carga (ver acima). Este script existe para **ressincronizar**
uma base que já roda — quando o IBGE publica município novo, ou para completar
uma base cujo seed rodou sem rede.

`prisma/sync-ibge.ts` popula países, estados, municípios e **CNAEs** (subclasses)
a partir das APIs abertas do IBGE. Idempotente e reexecutável; roda com a **role dona**
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

### Menu, rotina ou módulo novo: `sincronizar-catalogo` **[verificado em dev, 2026-08-26]**

Estrutura de navegação **não** entra por migration: ela mora em
`apps/api/prisma/catalogo-sistema.ts`, que é a definição única — o mesmo arquivo
que o `seed-base.ts` aplica ao criar uma base do zero. Editou o catálogo, rode:

```bash
docker exec -e DATABASE_URL="postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public" \
  plataforma-comercial-dev-api-1 sh -c "cd /app/apps/api && pnpm exec ts-node prisma/sincronizar-catalogo.ts"
```

Saída esperada quando não há nada a fazer: `Nada a fazer: a base já estava em dia
com o catálogo.`

Precisa da role dona (`plataforma`), como as migrations. É idempotente e **não
apaga nada**: cria o que falta e atualiza nome/rota/ícone/ordem do menu. Em
produção, roda **depois** do `migrate deploy`.

Por que existia divergência antes: isto vivia duas vezes — nos arrays do seed e
em `INSERT` espalhados por 17 migrations. Como o seed é destrutivo e nunca roda
contra dado real, só as migrations chegavam em produção, e as duas listas
divergiram três vezes (auditoria de 2026-08-25).

**O que ele não faz:** conceder permissão a perfil. Permissão gravada é
configuração do cliente — o administrador pode ter desmarcado algo de propósito,
e recolocá-la a cada deploy desfaria a decisão dele. Conceder acesso numa base
existente continua sendo uma migration escrita para aquela decisão (modelo:
`20260825220000_perm_whatsapp_supervisor_gerente`). A única permissão que o
script **retira** é a do perfil Diretor sobre rotinas de Administração, que é
correção de segurança — ver o cabeçalho do catálogo.

A ordem dos itens no menu é a **posição no array** `MENUS`: mover uma entrada ali
move o item na tela.

**Rotina nova que precisa nascer permitida** (o caso de `meus-atendimentos`, em
2026-09-02): a permissão continua sendo de migration, mas ela roda **antes** do
`sincronizar-catalogo` — e não acharia a rotina, que ainda não existe. Nesse
caso a migration cria o menu e a rotina (mesmos ids e código do catálogo,
`ON CONFLICT DO NOTHING`) e só então concede. Os dois lados são idempotentes,
então o script depois não encontra nada a fazer. Modelo:
`20260902120000_perm_meus_atendimentos`.

---

## Publicar imagens

`publish.ps1` (raiz) builda e **publica no Docker Hub** as **três** imagens
(`bjsoftware/rcgcba-api`, `-web` e `-whatsapp-worker`, tag `latest`), depois é
preciso redeploy no Portainer.

O script publica cada imagem **antes** de buildar a próxima — um erro no meio
deixa o conjunto desalinhado em produção. Rode os builds antes para pegar erros:

```bash
docker exec plataforma-comercial-dev-web-1 sh -c "cd /app/apps/web && pnpm exec next build"
docker exec plataforma-comercial-dev-api-1 sh -c "cd /app/apps/api && pnpm exec nest build"
docker exec plataforma-comercial-dev-whatsapp-worker-1 sh -c "cd /app/apps/whatsapp-worker && pnpm exec tsc -p tsconfig.json"
```

Com os containers de dev **parados** (só a infra de pé), o mesmo type-check sai
do build da imagem, sem publicar nada **[verificado em 2026-08-26]**:

```bash
docker build -f docker/web.Dockerfile -t rcgcba-web:check .
docker build -f docker/api.Dockerfile -t rcgcba-api:check .
```

O estágio de build roda `next build` / `nest build` (e compila
`@plataforma/contracts` antes), então um erro de tipo derruba o `docker build`
com o mesmo log. Não existe toolchain Node utilizável no Windows fora dos
containers: os `node_modules/` do repositório são links para `/app/...` de
dentro da imagem, e `pnpm` não está no PATH do host.

---

## WhatsApp em produção (primeiro deploy do worker) **[a confirmar na VPS]**

O `whatsapp-worker` nunca subiu em produção. Três coisas precisam acontecer, na
ordem — as duas primeiras já estão no repositório, a terceira é manual.

**1. Publicar a imagem.** `publish.ps1` agora builda e publica
`bjsoftware/rcgcba-whatsapp-worker:latest` junto com a API e o web. O
`docker build` da imagem de produção foi verificado em 2026-08-21 (Node 22 —
a `zapo-js` usa o `WebSocket` global, que não existe no 20).

**2. Definir `WHATSAPP_STORE_DATABASE_URL` e `WHATSAPP_WORKER_TOKEN`** no
Portainer (Stacks → rcgcba → Env), conforme `docker/.env.prod.example`.

A `DATABASE_URL` do worker **não é a da API**. A da API é o `plataforma_app`,
sem DDL e sem acesso ao schema `whatsapp`; a biblioteca de sessão roda as
migrations dela **a cada conexão**, então com a URL da API o worker não sobe.
O role certo é o `whatsapp_store`.

**3. Trocar a senha do role `whatsapp_store`.** A migration
`20260903150000_whatsapp_store_role` cria o role com a senha de placeholder
`whatsapp_store_dev_only` — mesmo tratamento que o `plataforma_app` recebeu.
Quem tem essa senha alcança as sessões pareadas, ou seja, **fala pelo WhatsApp
dos vendedores**. Rode com a role dona, depois do `migrate deploy`:

```bash
docker exec -e PGPASSWORD="SENHA_DA_ROLE_PLATAFORMA" <container-postgres> \
  psql -U plataforma -d plataforma_comercial \
  -c "ALTER ROLE whatsapp_store WITH PASSWORD 'SENHA_FORTE_AQUI';"
```

A mesma senha vai na `WHATSAPP_STORE_DATABASE_URL` do passo 2 — trocar uma sem
a outra derruba o worker no boot seguinte.

A migration acima restaura o que a baseline de 28/08 perdeu ao consolidar as 73
migrations incrementais: numa base criada do zero, o role e o schema `whatsapp`
não existiam e o worker não subia. Base que já rodou a baseline precisa deste
`migrate deploy` antes do passo 3.

**O que ainda não foi verificado:** nada disso rodou na VPS. Ao executar pela
primeira vez, confirmar aqui e trocar a marca `[a confirmar na VPS]`.

**Depois do deploy:** cada vendedor pareia o próprio aparelho pela tela (QR),
com o aceite registrado. `replicas: 1` no worker **é requisito, não
capacidade** — duas réplicas com a mesma sessão fazem o WhatsApp derrubar uma.

## WhatsApp com Evolution GO (transporte alternativo) **[a confirmar na VPS]**

Alternativa ao `whatsapp-worker`: um gateway de terceiro que mantém as sessões
no banco dele. A empresa usa **um transporte de cada vez** — a escolha está em
Administração → WhatsApp, e trocá-la exige que cada vendedor pareie de novo.

Nada disto foi executado na VPS ainda. Ao rodar pela primeira vez, confirme
cada passo aqui e troque a marca `[a confirmar na VPS]`.

**1. Fixar a tag da imagem.** O stack lê `${EVOLUTION_GO_IMAGE}` e não tem valor
padrão de propósito: `latest` troca o contrato do webhook sem aviso, e nomes de
rota já divergiram entre versões da Evolution GO.

A imagem é `evoapicloud/evolution-go`, no Docker Hub. Última estável verificada
em 2026-08-27: **0.7.2** (publicada em 2026-07-03). Há tags `-beta` publicadas
junto das estáveis — não use em produção. Registre a mesma versão no campo
"Versão homologada" da tela: é por ela que se investiga evento que parou de
chegar.

```bash
docker manifest inspect evoapicloud/evolution-go:0.7.2   # confirma que a tag existe
```

**1.1. Ativar a licença — pré-requisito, não detalhe.** Verificado em
2026-08-27: a 0.7.2 responde **503 `LICENSE_REQUIRED`** em toda a API até a
licença ser ativada, mesmo com a `GLOBAL_API_KEY` correta. Só `GET /server/ok`,
`/license/*` e `/swagger/*` funcionam sem ela. A ativação é pelo manager do
próprio serviço (`/manager/login`), que registra em
`license.evolutionfoundation.com.br` — ou seja, **depende de acordo com o
fornecedor**. Sem isso, não adianta seguir para os passos abaixo.

```bash
curl http://rcgcba-evolution-go:8080/license/status   # {"status":"inactive"} = bloqueado
```

**2. Criar o banco técnico.** Separado do `plataforma_comercial`: o gateway roda
as próprias migrations (precisa de DDL) e guarda credenciais de sessão. Com a
role dona:

```bash
docker exec -e PGPASSWORD="SENHA_DA_ROLE_PLATAFORMA" <container-postgres> \
  psql -U plataforma -d postgres \
  -c "CREATE ROLE evolution WITH LOGIN PASSWORD 'SENHA_FORTE_AQUI';" \
  -c "CREATE DATABASE evolution OWNER evolution;"
```

A mesma senha vai na `EVOLUTION_DATABASE_URL` do passo seguinte.

**3. Definir as variáveis** no Portainer (Stacks → rcgcba → Env), conforme
`docker/.env.prod.example`:

- `EVOLUTION_GO_IMAGE` — a tag fixa do passo 1;
- `EVOLUTION_DATABASE_URL` — o banco do passo 2. O stack a injeta em
  `POSTGRES_DB`, `POSTGRES_AUTH_DB` e `POSTGRES_USERS_DB`: **não existe**
  `DATABASE_URL` neste serviço, e sem as duas últimas ele sobe e morre em panic
  no auto-migration (verificado em 2026-08-27);
- `EVOLUTION_GLOBAL_API_KEY` — chave administrativa do gateway;
- `WHATSAPP_CRYPTO_KEY` — 32 bytes em base64, **na API**, para cifrar a chave
  acima, o token de cada instância e o segredo do webhook. Sem ela, gravar a
  chave pela tela é recusado.

**4. Gravar a chave pela tela.** Administração → WhatsApp → Evolution GO:
endereço interno (`http://rcgcba-evolution-go:8080`), a **mesma**
`EVOLUTION_GLOBAL_API_KEY` do passo 3 e a versão homologada. Salvar nessa aba é
o que passa a empresa para o transporte `evolution_go`.

**5. Parear.** Cada vendedor reconecta pela tela de Atendimento. A instância é
criada no gateway no primeiro "Conectar", com webhook e token próprios — não há
passo manual de criação de instância.

**Conferência rápida**, de dentro da rede Docker:

```bash
curl -H "apikey: $EVOLUTION_GLOBAL_API_KEY" \
  http://rcgcba-evolution-go:8080/instance/status?instanceId=rcg-<sessaoId>
```

**O que não pode acontecer:** publicar o gateway no Traefik. Quem o alcança
fala pelo WhatsApp dos vendedores, e o webhook trafega só na rede interna.
`replicas: 1` também aqui é requisito.

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

## 2ª via de DANFE e boleto — o que a operação precisa saber **[a confirmar na VPS]**

Ver [`docs/planos/segunda-via-danfe-boleto.md`](planos/segunda-via-danfe-boleto.md)
para o desenho; aqui só o que muda na operação.

**1. Migrations.** Duas, aplicadas pelo procedimento normal desta página
(`Migrations em produção`), com o role dono (`plataforma`):

- `20260821180000_segunda_via_danfe_boleto` — tabela `contas_bancarias` (com
  RLS) e colunas novas em `titulos_receber` e `notas_saida`.
- `20260821180500_rotina_contas_bancarias` — menu/rotina e permissão do
  Administrador.

**2. Cadastrar o convênio.** Sem uma conta marcada como **padrão** em
Administração › Contas Bancárias, nenhum boleto sai — os títulos importados do
legado não apontam conta nenhuma. Agência, conta e carteira entram no código de
barras: confira com o extrato antes de salvar, porque erro aqui não aparece na
tela, aparece no caixa do banco.

**3. Onde o XML fica.** Na tabela `nota_saida_xml` (migration
`20260824180000`), **não** em disco — a versão anterior gravava em
`uploads/nfe` e foi revista em 2026-08-24. Nada a criar em volume; o XML entra
no dump do banco junto com a nota. Cresce ~40 MB/ano no volume atual de notas,
e uma carga retroativa completa fica em torno de 60–100 MB (o TOAST do
Postgres comprime o TEXT sozinho).

**4. O ERP precisa passar a enviar** (senão a 2ª via nunca fica disponível):

- `POST /integracao/notas-saida/{codigoLegado}/xml` com `{"xml": "..."}` ou
  `{"xmlBase64": "..."}` — o XML autorizado (`nfeProc`). Reenviar substitui.
- No upsert de títulos, os campos `nossoNumero` (obrigatório para haver
  boleto), `carteira`, `contaBancariaDescricao` e, se existirem,
  `codigoBarras` / `linhaDigitavel` já registrados no banco.

**5. Conduzindo a carga retroativa dos XMLs.** O limite do endpoint de envio é
de 120 requisições por minuto por chave. O ERP descobre o que falta com
`GET /integracao/notas-saida?semXml=true` (paginado) e confere o que já
entregou com `GET /integracao/notas-saida/{codigo}/xml`, que devolve
recebimento, tamanho e situação sem trazer o arquivo. Envio no `codigoLegado`
errado se desfaz com `DELETE /integracao/notas-saida/{codigo}/xml`.

---

## Agente IA com a assinatura ChatGPT (provedor Codex) **[verificado em 2026-08-24]**

O provedor **Codex** não usa chave de API: ele autentica com o login OAuth da
assinatura ChatGPT, o mesmo do `codex login`. Isso muda o procedimento de
configuração, e traz limitações que não existem nos outros provedores.

> **Antes de habilitar, saiba o risco.** O endpoint
> (`https://chatgpt.com/backend-api/codex/responses`) é privado e **não
> documentado** pela OpenAI — existe para os aplicativos oficiais do Codex (CLI,
> extensão de IDE). Não há contrato de estabilidade: formato, headers e a
> whitelist de `originator` podem mudar sem aviso e derrubar o agente em
> produção. E usar a assinatura fora daqueles aplicativos pode contrariar os
> termos de uso, com risco de **suspensão da conta**. Para uso comercial
> contínuo, o provedor `openai` com chave de API é o caminho suportado.

### Por que conectar é em duas etapas

O cliente OAuth é o do CLI oficial e tem `redirect_uri` fixo em
`http://localhost:1455/auth/callback`. Não dá para trocar, e uma API numa VPS
não tem como receber esse callback. Então, em **Administração > Agente IA**, com
o provedor Codex selecionado:

1. **Abrir autorização** — abre o login da OpenAI numa aba nova.
2. Depois de autorizar, o navegador tenta ir para `localhost:1455` e **mostra
   erro de conexão. Isso é o esperado, não é falha.**
3. Copiar a URL inteira da barra de endereço e colar no campo **URL de retorno**
   → **Conectar**.

O `code_verifier` do PKCE nunca sai da API, e o pedido expira em 10 minutos.

> A página `/success?id_token=...` **não serve**: ela é a tela final do CLI, e
> nela o código já foi consumido. Quem chegou nela tem o CLI instalado e deve
> usar a aba "Importar do Codex CLI".

### Atalho: importar de um Codex CLI já logado

Na aba **Importar do Codex CLI**, cole o conteúdo de `~/.codex/auth.json`
(Windows: `%USERPROFILE%\.codex\auth.json`). Só o `refresh_token` importa — o
access token do arquivo é ignorado e renovado na hora, o que de quebra valida a
sessão na mesma requisição.

> **Efeito colateral:** o refresh token **rotaciona** a cada renovação e a
> OpenAI invalida o anterior. A partir da importação, a API e o CLI disputam a
> mesma sessão — quando um renova, o outro pode precisar de um novo
> `codex login`. Se o CLI for usado no dia a dia, prefira o fluxo pelo
> navegador, que cria uma sessão separada.

### Limitações do provedor Codex

| Campo da tela | O que acontece |
|---|---|
| Chave de API / Endpoint | Não aparecem — a credencial é a conta conectada. |
| Modelo | Lista **fixa** (o backend não tem `/models`). Os nomes da API pública (`gpt-5`, `gpt-5.1-codex`, `o4-mini`…) são **recusados**; valem só `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`. A referência do CLI fica em `~/.codex/models_cache.json`. |
| Temperatura | Escondida — modelos de reasoning não aceitam o parâmetro. |
| Tamanho máximo da resposta | Ignorado: o backend recusa `max_output_tokens` (400 "Unsupported parameter"). O teto é o da assinatura. |
| Máximo de iterações de ferramentas | **Suba para 8–10.** Os modelos do Codex são agênticos e encadeiam várias consultas antes de responder; com o padrão de 5 a conversa termina em "não consegui concluir o raciocínio dentro do limite de passos". |

O erro **429** aqui não é throttle passageiro: é o limite de uso da assinatura,
por janela de horas/semana. Tentar de novo em seguida não resolve.

### Pré-requisito: `AGENTE_IA_CRYPTO_KEY` **[verificado em 2026-08-25]**

Toda credencial do agente — chave de API e os dois tokens OAuth — é gravada
cifrada (AES-256-GCM) em `agente_credenciais`. Sem a variável, gravar falha com:

```
AGENTE_IA_CRYPTO_KEY não configurada — não é possível gravar a chave de API do
agente. Gere 32 bytes em base64 e defina a variável de ambiente.
```

Isso é recusa deliberada, não bug: gravar segredo de terceiro em claro no banco
é o tipo de coisa que ninguém descobre até vazar (ver `agente-cripto.ts`).

**Gerar a chave** (qualquer máquina com Node ou OpenSSL):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# ou
openssl rand -base64 32
```

**Definir em produção:** Portainer → Stacks → `rcgcba` → Environment variables →
`AGENTE_IA_CRYPTO_KEY` → redeploy. O `stack.rcgcba.prod.yml` já repassa a
variável; ela **não** é lida de arquivo (`.env.prod.example` é só referência).

Em dev não é preciso fazer nada: o `docker-compose.dev.yml` tem um valor padrão,
que **não** deve ser usado em produção.

> **Guarde a chave.** Trocá-la torna ilegível tudo o que já foi cifrado com a
> anterior — as credenciais gravadas param de funcionar e precisam ser
> regravadas pela tela (a conexão OAuth do Codex precisa ser refeita). O erro,
> nesse caso, é "Não foi possível decifrar a chave de API do agente".

---

## Armadilha: variável do Portainer que não chega ao container **[verificado em 2026-08-25]**

Sintoma: a variável está cadastrada em **Stacks → rcgcba → Environment
variables**, o redeploy rodou, e a aplicação continua dizendo que ela não
existe. Foi o que aconteceu com `AGENTE_IA_CRYPTO_KEY`:

```
AGENTE_IA_CRYPTO_KEY não configurada — não é possível gravar a chave de API do
agente.
```

**Causa:** a aba de variáveis do Portainer **não injeta nada no container**.
Ela só substitui `${VAR}` onde o YML referenciar. Se o `environment:` do
serviço não menciona a variável, ela fica no stack e a aplicação nunca a vê.

**Correção:** acrescentar a linha no serviço, e só então dar update:

```yaml
    environment:
      AGENTE_IA_CRYPTO_KEY: ${AGENTE_IA_CRYPTO_KEY}
```

**Diagnóstico em um comando** — dentro do container, não no host:

```bash
docker exec <container-da-api> printenv AGENTE_IA_CRYPTO_KEY
```

Vazio = falta a linha no YML (ou o serviço não foi recriado). Imprimindo o
valor = o problema é outro (valor inválido dá outra mensagem: "deve ter 32
bytes em base64").

### A causa de fundo: o YML do Portainer diverge do repo

O stack que roda na VPS foi editado pelo Portainer e **não** é atualizado
quando `docker/stack.rcgcba.prod.yml` muda. Toda variável nova que entra no
arquivo do repo reproduz o sintoma acima até alguém acrescentar a linha lá.

> Ao atualizar o stack, **cole o `docker/stack.rcgcba.prod.yml` inteiro** no
> editor do Portainer, em vez de editar linha a linha. O arquivo do repo passa
> a ser a fonte, e as variáveis novas vão junto.

Divergências já encontradas (2026-08-25), do repo para o que rodava na VPS:
`AGENTE_IA_CRYPTO_KEY`, `WHATSAPP_WORKER_TOKEN` e o serviço
`whatsapp-worker` inteiro (este último ainda não implantado — ver a seção do
WhatsApp em produção).
