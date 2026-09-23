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

> **Esse layout é frágil e há um `exclude` protegendo-o.** O `tsc` infere o
> rootDir a partir de *todos* os arquivos do programa: basta **um** script
> importar algo de `src/` para tudo sair em `prisma/dist/prisma/x.js` — inclusive
> o `seed-base.js`, que é o `CMD` da imagem `rcgcba-scripts`. Foi o que aconteceu
> ao compartilhar o gerador de demonstração, e por isso `demo-dados.ts` está no
> `exclude` do `tsconfig.scripts.json`. Antes de fazer um script daqui importar
> de fora de `prisma/`, confira onde `seed-base.js` foi parar.

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

Números esperados numa base nova **[conferidos em 2026-09-03, cluster limpo;
contagem de perfis atualizada em 2026-09-09 com a separação Administrador da
Plataforma/Administrador Empresa/Administrativo]**:
1 empresa (situação `ativa`), 1 admin, 7 perfis, 47 rotinas, 21 parâmetros,
193 países, 27 UFs, 5.571 municípios, 1.332 CNAEs. Mais o role `whatsapp_store`
e o schema `whatsapp`, criados pela migration.

O admin do seed nasce vinculado ao perfil "Administrador da Plataforma"
(`Perfil.administraPlataforma = true`), então a administração do SaaS (menu
Plataforma) funciona sem nenhum `UPDATE` manual — isso vale para base **nova**.
Numa base que já existia antes da migration `20260909120000_perfis_admin_plataforma`,
o backfill dela já promove quem tinha o antigo `Usuario.administradorPlataforma
= true`; só precisa de intervenção manual se aquele usuário não tinha nenhum
vínculo ativo com empresa nenhuma (a migration avisa via `RAISE NOTICE`).

`ceps` nasce vazia por desenho — os CEPs entram sob demanda, pelo ViaCEP, quando
um cliente é consultado.

> **Migration que insere menu, rotina ou permissão precisa de `WHERE EXISTS`.**
> A ordem aqui é `migrate deploy` e **depois** o seed, então quando as
> migrations rodam a tabela `modulos` ainda está vazia. Um `INSERT INTO "menus"`
> direto morre na chave estrangeira e **derruba a criação da base inteira** —
> aconteceu com `20260902120000_perm_meus_atendimentos`, descoberto ao ensaiar
> este procedimento num cluster limpo. `ON CONFLICT` não cobre: ele trata chave
> duplicada, não referência ausente. Guarde o insert com
> `WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = '...')`; na base nova não
> há mesmo o que fazer, porque o seed monta tudo a partir do catálogo.

> **Produção:** o histórico de migrations foi consolidado numa baseline única em
> 2026-08-28. Um banco que já rodou as migrations antigas **recusa** o
> `migrate deploy` (o Prisma confere o checksum de cada uma) — precisa ser
> recriado do zero. Ver `apps/api/prisma/migrations/README.md`.

---

## Base de demonstração **[escrito em 2026-09-19, não rodado em ambiente]**

Os botões ficam **no detalhe da empresa**, em Administração > Empresas
(`/admin/empresas/<id>`), abaixo do formulário — a pergunta que antecede a ação
é sempre "em qual empresa?", e ali ela já está respondida pela página em que se
está.

Não há tela própria nem item de menu: `demo-dados` é uma **rotina sem tela**
(`ROTINAS_SEM_TELA` no catálogo), pendurada no menu de Empresas, que existe só
para o RBAC. É rotina separada de `empresas` de propósito — editar o cadastro da
empresa e apagar o movimento dela são estragos de ordem diferente, e quem monta
um perfil precisa poder dar um sem dar o outro.

| Operação | Permissão | Reversível? |
|---|---|---|
| Popular com dados fictícios | `demo-dados.cadastrar` | sim — roda de novo e refaz |
| Remover só os dados `DEMO-` | `demo-dados.cadastrar` | sim |
| **Limpar a base da empresa** | `demo-dados.excluir` | **não** |

### Popular

Oito meses de movimento: **seis meses fechados**, o corrente até hoje e o
seguinte inteiro (esse último para quem navegar para a frente não achar tela
vazia). Clientes com CNAE e cesta por ramo, produtos, notas com XML de NF-e,
títulos com dados de boleto, orçamentos, metas, CRM e conversas de WhatsApp.

Tudo leva o prefixo `DEMO-`. Rodar de novo apaga o conjunto anterior e cria
outro — **cadastro feito à mão não é tocado**.

### Limpar a base da empresa

Apaga **todo** o dado de negócio da empresa, inclusive o que foi digitado de
verdade. A fronteira está em `src/modules/demo/demo-limpeza.ts`, em duas listas
explícitas, e um teste (`demo-limpeza.spec.ts`) falha se alguma tabela nova com
`empresaId` ficar fora das duas.

**Preserva**, por decisão de 2026-09-19: usuários e vínculos de acesso,
parâmetros e configurações de tela, a chave de API do agente, o pareamento do
WhatsApp e a trilha de auditoria. Sem isso a empresa ficaria inutilizável
depois da limpeza — e uma operação destrutiva que apaga o próprio registro é o
oposto do que a auditoria existe para fazer.

**A confirmação é digitada, não clicada:** a API exige a razão social exata em
`confirmacao` e recusa qualquer outra coisa. Um "tem certeza?" com dois botões é
respondido no automático; o erro caro aqui é estar na empresa errada sem
perceber.

### Por que a tela pode fazer isso sem a role dona — e o que a RLS *não* garante

O gerador e a limpeza rodam dentro de `withTenant`, então valem as policies de
RLS. Elas são `USING ("empresaId" = current_setting('app.current_empresa_id',
true))` e **não** declaram `WITH CHECK` — o Postgres então reaproveita o `USING`
na checagem de INSERT, e o mesmo recorte passa a valer para ler, gravar e
apagar. A role `plataforma_app` tem `SELECT, INSERT, UPDATE, DELETE` em todas as
tabelas (bloco 2 da baseline) e nenhum privilégio que contorne RLS, então cada
`deleteMany` alcança uma empresa só.

> **Cuidado com a conclusão fácil aqui.** A RLS escopa para o `empresaId` que o
> código define: ela protege contra **esquecer um filtro**, não contra **passar
> o id errado de propósito**. Como estas rotas recebem a empresa pela URL
> (`/empresas/:empresaId/demo/...`), quem decide o alcance é
> `DemoService.garantirAlcance` — administrador da plataforma alcança todas, os
> demais só as empresas a que estão vinculados, mesmo recorte de
> `EmpresasService.findAll`. Sem essa checagem bastaria trocar o id na
> requisição.

O script de linha de comando é o outro extremo: roda com a role dona
(`plataforma`), **fora** do `withTenant` e portanto sem RLS nenhuma — lá quem
garante o recorte é só o `empresaId` que ele passa. Mesma geração, três
garantias diferentes conforme o caminho.

### Linha de comando (dev)

```bash
# a empresa mais antiga — numa base do seed-base.ts é a única que existe
pnpm --filter @plataforma/api demo:dados

# alvo explícito: aceita nome, CNPJ ou id
pnpm --filter @plataforma/api demo:dados -- --empresa=BJSoftware

# remove o conjunto DEMO- e não recria
pnpm --filter @plataforma/api demo:dados -- --limpar
```

Com duas empresas casando com o `--empresa=`, o script **recusa** e lista as
candidatas em vez de escolher: popular a empresa errada com dado fictício é um
estrago que só aparece na frente do cliente.

> **`demo-dados.ts` está fora do build da imagem** (`exclude` em
> `prisma/tsconfig.scripts.json`), e isso não é descuido. Ele importa o gerador
> de `src/` — o que basta para o `tsc` subir o rootDir inferido e mover **todos**
> os scripts de `prisma/dist/x.js` para `prisma/dist/prisma/x.js`, inclusive o
> `seed-base.js`, que é o `CMD` da imagem `rcgcba-scripts`. Em produção o
> caminho é a tela; em dev, `ts-node`, que não depende deste build.

### Para a tela aparecer numa base que já existe

Três passos, nesta ordem — e nenhum deles é opcional:

```bash
# 1. rotina (sem menu) e a permissão para os perfis de administrador
pnpm --filter @plataforma/api prisma:deploy   # migration 20260919120000_perm_demo_dados

# 2. alinha o catálogo (idempotente: não deve achar nada a fazer, depois do passo 1)
#    ver a seção "Menu, rotina ou módulo novo"

# 3. reiniciar a API — a rota /demo é nova
#    ver "Armadilha: rota nova da API não aparece depois de um docker restart"
```

**Por que a migration, se estrutura mora no catálogo:** `sincronizar-catalogo`
cria a rotina, mas **não concede permissão a perfil** — permissão gravada é
configuração do cliente. Sem a migration a rotina nasceria sem ninguém podendo
usá-la, nem o administrador, até alguém marcá-la à mão em Perfis. Por isso a
migration cria a rotina (mesmo id e código do catálogo,
`ON CONFLICT DO NOTHING`) e só então concede — o modelo é
`20260902120000_perm_meus_atendimentos`.

Ela **não** cria menu: `demo-dados` é rotina sem tela, e o `WHERE EXISTS` guarda
contra `seed-menu-empresas` em vez de contra o módulo. Numa base nova, `menus`
ainda está vazia quando as migrations rodam, e sem esse guarda o INSERT morreria
em `rotinas_menuId_fkey` levando o deploy inteiro junto.

**Quem nasce com acesso:** só `Administrador da Plataforma` e
`Administrador Empresa` (e o nome antigo `Administrador`, para bases anteriores
à separação dos perfis). **Diretor fica de fora** — quem quiser dar a mais
gente marca na tela de Perfis, e `demo-dados.excluir` apaga o cadastro real da
empresa, então é decisão para se tomar olhando.

Base nova não precisa de nada disso: o `seed-base.ts` aplica o catálogo e concede
todas as ações aos dois perfis de administrador.

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

## pgvector: exigência do servidor de banco **[verificado em dev, 2026-09-05]**

A busca de produto do pré-atendimento guarda os trechos das fichas técnicas
como vetores, e isso exige a extensão **`vector` (pgvector) disponível no
servidor de banco** — não basta a aplicação querer.

**Antes de rodar as migrations em produção**, confira:

```bash
psql -U plataforma -d plataforma_comercial -c "select name, default_version from pg_available_extensions where name='vector';"
```

**Sem a extensão o deploy não quebra.** A migration tenta criar, avisa e segue:
a tabela de trechos nasce sem a coluna de vetor, o corte das fichas em pedaços
continua valendo e a busca fica só por texto. Impor a extensão derrubaria o
deploy inteiro por uma funcionalidade que sabe degradar.

Para ter a busca semântica, o que fazer depende do servidor:

| Situação | Caminho |
|---|---|
| Banco em container que você controla | trocar a imagem por `pgvector/pgvector:pg16` (mesma major, o volume continua servindo) |
| Banco gerenciado (RDS, DigitalOcean, Supabase) | pgvector costuma estar na lista de extensões; habilitar pelo painel |
| Postgres do sistema, compilado | instalar o pacote (`postgresql-16-pgvector` no Debian/Ubuntu) e reiniciar |

### Habilitar depois, num banco que já subiu sem a extensão

Migration roda uma vez, então instalar a extensão mais tarde não faz a coluna
aparecer sozinha. A sequência é:

1. instalar a extensão no servidor (tabela acima);
2. rodar `docs/sql/habilitar-pgvector-fichas.sql` **com a role dona**
   (`plataforma`) — cria a coluna e o índice, e é idempotente;
3. configurar o gerador de embeddings em Administração > Agente IA;
4. `POST /produto-fichas-importacao/vetorizar` até devolver `0`.

O passo 4 **não relê PDF nenhum**: o texto dos trechos já está gravado desde a
importação. A API detecta a coluna sozinha — o resultado negativo fica em cache
por cinco minutos, então não é preciso reiniciar.

Em **dev** isso já está resolvido: o `docker-compose.dev.yml` usa
`pgvector/pgvector:pg16`. A troca da imagem oficial para essa foi feita com o
volume existente e **não** recriou o banco — mesma major version. O Postgres
pode avisar de versão de collation na primeira subida (a imagem é Debian, a
anterior era Alpine); é aviso, não erro.

### O gerador de embeddings: Ollama local **[verificado em dev, 2026-09-05]**

A extensão guarda o vetor; quem **gera** o vetor é um serviço à parte. A escolha
foi **Ollama rodando na própria VPS** com `nomic-embed-text`: sem chave, sem
custo por chamada, sem limite de taxa na carga das fichas, e o texto não sai da
infra. Custa memória — reserve ~1,5 GB para o container.

O serviço está na stack auxiliar `docker/stack.servicos.prod.yml`, junto do
Evolution GO, como **opcional**: não subi-lo apenas deixa a busca semântica
desligada. A stack principal `docker/stack.rcgcba.prod.yml` contém API, web e
whatsapp-worker. Ambas usam a rede externa `network_public`, mantendo os aliases
`rcgcba-ollama`, `rcgcba-evolution-go` e `rcgcba-api` para comunicação.

No Portainer, crie a stack auxiliar como `rcgcba-servicos`, usando
`docker/.env.servicos.prod.example` como referência das variáveis.
**[a confirmar na VPS]** Se esses serviços já estiverem na stack principal,
remova-os dela antes de subir a auxiliar para evitar sessões e aliases duplicados.
Preserve o banco e a chave do Evolution GO. Para reutilizar modelos já baixados,
configure o volume da stack auxiliar como externo, com o nome real do volume
existente (confira em Volumes no Portainer):

```yaml
volumes:
  ollama_models:
    external: true
    name: NOME_REAL_DO_VOLUME_EXISTENTE
```

Em uma instalação nova, mantenha o volume padrão do YAML e baixe o modelo abaixo.

**O modelo não vem na imagem.** Depois do primeiro deploy do serviço:

```bash
docker exec <container-ollama> ollama pull nomic-embed-text
```

São ~275 MB, e o volume `ollama_models` os preserva entre redeploys. Sem esse
passo o serviço sobe e responde erro a cada pedido de embedding.

Depois, em **Administração > Agente IA**, os campos de embedding:

| Campo | Valor |
|---|---|
| URL | `http://rcgcba-ollama:11434/v1` (o alias do stack) |
| Modelo | `nomic-embed-text` |
| Chave | vazio — o Ollama local não pede autenticação |

> **A dimensão é casada com o modelo.** A coluna é `vector(768)`, que é a do
> `nomic-embed-text`. Trocar para um modelo de outra dimensão (o
> `text-embedding-3-small` da OpenAI tem 1536) exige recriar a coluna, o índice
> e **reprocessar todos os vetores** — a API recusa gravar vetor de tamanho
> diferente em vez de misturar o que não se compara.

Sem nada disso configurado nada quebra: os trechos ficam sem vetor e a busca
lexical atende sozinha. Ao configurar depois, `POST
/produto-fichas-importacao/vetorizar` preenche o que faltou, 200 por chamada,
sem reler PDF nenhum — o texto já está gravado desde a importação.

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
apaga nada**: cria o que falta e atualiza nome/rota/ícone/ordem e o
**módulo** do menu — mover um item de módulo no catálogo (como o "Recado para a
equipe", que saiu do Comercial para o Gerencial em 2026-09-08) é exatamente isto,
sem migration. Em
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

**O catálogo vence a tela de Estrutura de Menu** (Administração → Estrutura de
Menu). Desde 2026-09-22 essa tela move menu entre módulos, reordena, renomeia e
liga/desliga. Para um menu que **está no catálogo**, tudo isso vale até o
próximo `sincronizar-catalogo`, que regrava nome, ícone, rota, ordem e
`moduloId` a partir do arquivo. Sobrevivem: o que a tela criou do zero e os
campos que o script não toca — entre eles o `ativo` (o liga/desliga de módulo,
menu e rotina) e as rotinas, cujo upsert é `update: {}`. Mudança de organização
que precisa durar entra no `catalogo-sistema.ts`.

**Migration que concede permissão:** filtre por `perfis."sistemaBase" = true`, e
não pelo nome do perfil — ver "Migration que concede permissão" em
`apps/api/prisma/migrations/README.md`. O molde antigo, que casava
`nome = 'Administrador'`, não concede nada nesta plataforma.

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

A senha vai dentro de uma URL (`postgresql://whatsapp_store:SENHA@postgres:...`),
então **use só letras e números**: `@`, `:`, `/`, `?`, `#` e `%` são separadores
de URL e quebram a conexão do worker de um jeito que não parece erro de senha.
Gerar uma sem esses caracteres:

```bash
openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40; echo
```

A migration acima restaura o que a baseline de 28/08 perdeu ao consolidar as 73
migrations incrementais: numa base criada do zero, o role e o schema `whatsapp`
não existiam e o worker não subia. Base que já rodou a baseline precisa deste
`migrate deploy` antes do passo 3. **[verificado em dev, 2026-09-03]** — o
`migrate deploy` aplicou a migration e o `whatsapp-worker` subiu conectando ao
store sem erro. Ressalva: no dev o role já existia de antes (roles são objetos
do cluster, não do banco, e o cluster local nunca foi recriado), então ali a
migration é no-op. A prova de que ela resolve o caso da VPS veio de um
`postgres:16-alpine` descartável: baseline sozinha deixa 0 role e 0 schema.

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

**3. Definir as variáveis** no Portainer (Stacks → rcgcba-servicos → Env), conforme
`docker/.env.servicos.prod.example`, e usar `docker/stack.servicos.prod.yml`:

- `EVOLUTION_GO_IMAGE` — a tag fixa do passo 1;
- `EVOLUTION_DATABASE_URL` — o banco do passo 2. O stack a injeta em
  `POSTGRES_DB`, `POSTGRES_AUTH_DB` e `POSTGRES_USERS_DB`: **não existe**
  `DATABASE_URL` neste serviço, e sem as duas últimas ele sobe e morre em panic
  no auto-migration (verificado em 2026-08-27);
- `EVOLUTION_GLOBAL_API_KEY` — chave administrativa do gateway;

Na stack principal (Stacks → rcgcba → Env), mantenha `WHATSAPP_CRYPTO_KEY`
conforme `docker/.env.prod.example`: 32 bytes em base64, **na API**, para cifrar
a chave acima, o token de cada instância e o segredo do webhook. Sem ela,
gravar a chave pela tela é recusado.

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

## WhatsApp com a Cloud API oficial da Meta (terceiro transporte) **[a confirmar]**

Terceiro provedor, ao lado de `zapo` e `evolution_go`. Diferente dos outros
dois: **oficial** da Meta, sem pareamento por QR, só na sessão institucional
(`tipo: 'empresa'`) — não aparece na conexão do vendedor. Desenho completo em
`docs/planos/whatsapp-api-oficial.md`.

**Migration.** `20260909150000_whatsapp_cloud_api` — campos novos em
`whatsapp_config`, coluna `ultimaMensagemClienteEm` em `whatsapp_conversas` e
a tabela `whatsapp_templates` (com RLS). Aplicada pelo procedimento normal
desta página (`Migrations em produção`), role `plataforma`.

**Diferente do Evolution GO, esta integração ainda não foi testada contra o
serviço real da Meta** — só o handshake do webhook foi validado localmente
(token certo devolve o `hub.challenge`, token errado dá 403). Antes de operar
em produção:

1. **Conta de desenvolvedor Meta + número de teste do Business Manager** —
   passo manual, gera o Phone Number ID, o Business Account ID, o token de
   acesso e o App Secret.
2. **Gravar em Administração > WhatsApp > API Oficial**: os quatro campos
   acima, mais o Webhook Verify Token (gerado na própria tela — não é
   segredo de tráfego, só confere o handshake).
3. **Colar a URL do webhook** (mostrada na mesma tela,
   `.../api/v1/whatsapp/cloud-api/webhook/<empresaId>`) no painel da Meta —
   ela chama o `GET` de handshake uma vez, depois só `POST` de eventos.
4. **Sincronizar templates** (botão na tela) antes de esperar que o envio por
   template funcione — sem isso a lista fica vazia mesmo com templates
   aprovados no Business Manager.
5. Confirmar o fluxo de verdade: mensagem recebida grava a conversa, texto
   livre sai dentro da janela de 24h, janela fechada oferece o seletor de
   template na tela de Atendimento (o composer troca sozinho ao receber o
   409 com `codigo: WHATSAPP_JANELA_FECHADA`).

**Corpo bruto do webhook.** `main.ts` passa `rawBody: true` ao
`NestFactory.create` — é o que permite ao controller conferir a assinatura
HMAC-SHA256 (`X-Hub-Signature-256`) contra o corpo exatamente como a Meta o
mandou. Não afeta nenhuma outra rota da API.

Ao validar pela primeira vez com uma conta real, troque a marca
**[a confirmar]** acima e registre aqui o que divergiu — o mesmo cuidado já
tomado com a Evolution GO, cuja documentação (`hub.mode`, nomes de campo do
payload) pode não bater exatamente com o que a conta em uso devolve.

## Armadilha: `HTTP 500 INTERNAL_ERROR` porque o schema andou e a migration não **[verificado em dev, 2026-09-22]**

Sintoma: uma rota que sempre funcionou passa a responder
`{"code":"INTERNAL_ERROR","message":"Erro interno inesperado"}`. Em 22/09/2026
isso apareceu três vezes no mesmo dia, em lugares sem relação aparente: o
`POST /api/v1/integracao/produtos` do Protheus, o **login** e o `GET /modulos`
(que derruba a barra lateral inteira).

Causa, sempre a mesma: alguém editou o `schema.prisma` (ou o código passou a ler
um campo novo) **sem criar a migration**. O Prisma gera o SQL a partir do
schema, o Postgres recusa a coluna ou a tabela que não existe, e o filtro de
exceção transforma isso no 500 genérico. Em dev o `prisma generate` ainda faz o
código compilar, o que esconde o problema até a primeira chamada.

O erro real **não** vai para a resposta HTTP — ele está no log da API e na tela
Plataforma → Erros, em uma linha direta:

```
The column `usuarios.perfilPlataformaRole` does not exist in the current database.
The table `public.assinaturas` does not exist in the current database.
```

```bash
# o que o banco tem de diferente do schema (não aplica nada, só imprime o SQL)
docker exec plataforma-comercial-dev-api-1 sh -c \
  "cd /app/apps/api && pnpm exec prisma migrate diff \
   --from-url \"postgresql://plataforma:plataforma@postgres:5432/plataforma_comercial?schema=public\" \
   --to-schema-datamodel ./prisma/schema.prisma --script"
```

Saída vazia = banco e schema em dia. Se sair DDL, falta migration — escreva-a a
partir desse SQL (com a RLS das tabelas que têm `empresaId`) e rode
`migrate deploy`.

**Cuidado ao aproveitar esse SQL:** o diff também propõe `DROP` do que existe no
banco e o schema não declara — o índice vetorial de `produto_ficha_trechos`, por
exemplo, que é criado à mão (ver a seção de pgvector). Copie as criações, nunca
os DROPs.

**Antes de um deploy**, rode o mesmo diff contra o banco de produção: é mais
barato descobrir a coluna faltando aqui do que pelo 500 do cliente.

## Armadilha: rota nova da API não aparece depois de um `docker restart` **[verificado em dev, 2026-09-08]**

Sintoma: você criou um endpoint, reiniciou `plataforma-comercial-dev-api-1`, e o log de
inicialização lista as rotas **sem** a nova — como se o arquivo não existisse. O código
está lá dentro (`docker exec ... grep` no fonte encontra), e mesmo assim o Nest não a
mapeou.

Causa: o container roda `nest start --watch`, e o restart **apaga o `dist/` e recompila
do zero**. A compilação leva de 50 s a 2 min; o processo sobe com o que existia antes de
ela terminar. O `docker logs` mistura os dois streams, então o "successfully started"
parece vir depois do "Found 0 errors" mesmo quando não veio.

O caminho que funciona: reiniciar, **esperar a compilação terminar** e reiniciar de novo.

```bash
docker restart plataforma-comercial-dev-api-1
# espera o dist ficar pronto (não confie no relógio dos logs)
for i in $(seq 1 40); do
  docker exec plataforma-comercial-dev-api-1 \
    sh -c "test -f /app/apps/api/dist/main.js" && break
done
docker restart plataforma-comercial-dev-api-1
docker logs plataforma-comercial-dev-api-1 2>&1 | grep "Mapped {/api/<sua-rota>"
```

Só a última linha prova que subiu: enquanto a rota não aparecer no `Mapped`, qualquer
teste contra ela mede a versão antiga.

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

---

## Log de erros (Plataforma > Erros) **[verificado em dev, 2026-09-04]**

Onde alguém olha quando algo falha, sem abrir o log do container. Plano e
decisões em [`docs/planos/log-de-erros.md`](planos/log-de-erros.md).

**Quem vê:** só usuário com `administradorPlataforma` (vem do perfil
"Administrador da Plataforma" do vínculo ativo, não de uma permissão de
rotina comum) — o menu aparece pelo mesmo atributo que abre as demais telas
de Plataforma. Mensagem e stack ficam íntegros na base, e é por isso que a
leitura é fechada: um 500 numa consulta traz dado real de cliente no stack.

**Deploy:** nada além do `migrate deploy` de sempre. A migration
`20260904140000_log_de_erros` **ocupa a tabela `audit_logs`**, que existia no
schema e nunca foi escrita (0 linhas em toda base). Ela troca as colunas
antigas, então:

> Se em alguma base alguém tiver escrito em `audit_logs` fora deste repo, esse
> conteúdo se perde na migration. Confira antes com
> `SELECT count(*) FROM audit_logs;` — o esperado é 0.

A migration também cria `erros_log_config` já com a linha única. Nenhuma das
duas tabelas tem RLS, de propósito (ver `apps/api/prisma/migrations/README.md`).
Nenhum `GRANT` manual é necessário: o `ALTER DEFAULT PRIVILEGES` da baseline
cobre tabela nova para `plataforma_app` — conferido nesta migration.

**Governança (na própria tela, botão "Governança"):**

| Campo | Padrão | O que faz |
|---|---|---|
| Retenção (dias) | 30 | 0 = sem expurgo por tempo |
| Teto por empresa | 5000 | 0 = sem teto; corta as mais antigas |
| Registrar 4xx | desligado | liga erro de preenchimento junto |

O expurgo roda a cada 30 min dentro da API (`ErrosVarreduraService`), com uma
passagem no boot — não há cron externo.

**"Registrar 4xx" é interruptor de investigação**, não configuração
permanente: ligue para reproduzir um caso, desligue depois. Ligado, o log enche
de "campo obrigatório" e esconde o 500 que importa. A mudança leva até **30
segundos** para valer: a configuração fica em cache no processo, porque é lida a
cada erro gravado.

**Se a tela estiver vazia num incidente**, isso agora é informação — antes da
captura no navegador não era. O que continua fora do alcance dela: erro na tela
de login (a rota de report exige sessão) e queda do próprio Postgres (o log
grava nele). Nesses dois casos, o rastro é o console do container.
