# Enriquecimento por APIs públicas — IBGE, ViaCEP e MinhaReceita

> Plano de implementação registrado em 2026-07-24. Ainda não implementado — serve
> como referência para quando a implementação começar.

## Contexto

Decisão do usuário (2026-07-24): os dados **geográficos/fiscais de referência**
e o **enriquecimento cadastral de clientes** deixam de vir do ERP e passam a ser
obtidos de fontes públicas oficiais:

- **IBGE** — fonte autoritativa de estados, municípios e da tabela-referência de
  CNAEs.
- **ViaCEP** — resolução de endereço a partir do CEP.
- **MinhaReceita** (`minhareceita.org`, base pública da Receita Federal,
  auto-hospedável) — dados cadastrais completos de um CNPJ: razão social, nome
  fantasia, endereço, situação cadastral, CNAE principal + secundárias, quadro
  de sócios (QSA) e contatos.

Isso muda o que já foi construído: o `import-auxiliares.ts` importava
estados/municípios/CEPs do MySQL do ERP — essa parte é **substituída** pela
sincronização IBGE + cache ViaCEP. Os CRUDs de Estados/Municípios/CEPs/CNAEs
**permanecem**, mas viram telas de **referência/consulta** (read-mostly),
alimentadas por sync automático em vez de digitação/ERP.

Recomendação (a confirmar): manter esses CRUDs somente-leitura para busca (o
usuário consulta, não edita — a fonte é o IBGE); edição manual fica como exceção
para correção pontual.

## Camada comum — `ExternalHttpModule` (`apps/api/src/common/external-http/`)

Um módulo utilitário fino sobre `fetch` (undici, nativo no Node 20) com:

- Timeout por requisição (env `EXTERNAL_HTTP_TIMEOUT_MS`, default 8000) via
  `AbortController`.
- `User-Agent` identificando a plataforma (cortesia com serviços públicos).
- Log estruturado (Nest `Logger`): host, status, latência — sem PII no log.
- Tratamento de erro uniforme: timeout/5xx da fonte → `502 Bad Gateway` para o
  cliente da nossa API (a falha é da dependência externa, não do nosso servidor),
  com mensagem clara; "não encontrado" (ex.: CNPJ/CEP inexistente) → `404`.
- Base URLs por env (todas com default público):
  `IBGE_BASE_URL=https://servicodados.ibge.gov.br`,
  `VIACEP_BASE_URL=https://viacep.com.br`,
  `MINHARECEITA_BASE_URL=https://minhareceita.org`.

Nenhuma dessas APIs exige credencial. Se no futuro migrarem para MinhaReceita
self-hosted, só troca a env.

## Fase 1 — IBGE: sincronização de referência (server-side, sem chamada por request)

Estados, municípios e CNAEs mudam raramente — não se consulta o IBGE a cada
request. Um comando de sincronização popula/atualiza as tabelas locais e roda no
provisionamento (junto do seed) e sob demanda (script `sync:ibge`).

Fontes:

- Estados: `GET /api/v1/localidades/estados` → `[{ id, sigla, nome, regiao }]`.
  Upsert por `sigla`; `codigoIbge = id`.
- Municípios: `GET /api/v1/localidades/municipios` → cada item traz
  `id` (código IBGE de 7 dígitos), `nome` e a UF em
  `microrregiao.mesorregiao.UF.sigla`. Upsert por `codigoIbge`; resolve
  `estadoId` pela sigla. ~5.570 registros.
- CNAEs (tabela-referência): `GET /api/v2/cnae/subclasses` → `id` (subclasse
  7 dígitos), `descricao`, e a hierarquia `classe/grupo/divisao/secao`
  aninhada. Upsert por `codigoErp`(= id da subclasse). Preenche a tabela `cnaes`
  que hoje está vazia — é o que dá lastro ao `cliente_cnae`.

Idempotente (upsert), reexecutável. Substitui o trecho geográfico do
`import-auxiliares.ts`; o import antigo continua válido só para
categorias/condições/armazéns (dados de negócio do ERP).

`codigoErp` nessas tabelas passa a significar "código da fonte oficial" (id
IBGE), não mais "código do ERP" — coerente, já que a fonte mudou.

## Fase 2 — ViaCEP: resolução de endereço (lookup + cache)

Endpoint nosso: `GET /api/v1/ceps/consulta/:cep` (sob `JwtAuthGuard`; sem
permissão específica — é utilitário de formulário).

Fluxo:

1. Normaliza o CEP (8 dígitos). Busca no nosso `ceps` (cache). Achou → devolve.
2. Miss → `GET viacep.com.br/ws/{cep}/json/`. Resposta:
   `{ cep, logradouro, complemento, bairro, localidade, uf, ibge, ddd }`.
   `{ "erro": true }` → 404.
3. Persiste no `ceps` (`origem = 'viacep'`), resolvendo `estadoId` pela `uf` e
   `municipioId` pelo `ibge` (código IBGE que casamos na Fase 1). Devolve o
   registro normalizado.

Uso no front: no `cliente-form` (e onde houver endereço), ao sair do campo CEP,
chama o endpoint e preenche endereço/bairro/município/UF; o usuário só confirma.
Cache-first faz a maioria das consultas baterem no nosso banco.

## Fase 3 — MinhaReceita: enriquecimento de cliente por CNPJ

Endpoint nosso: `GET /api/v1/clientes/consulta-cnpj/:cnpj` (sob
`JwtAuthGuard` + `@RequirePermission('clientes','visualizar')`; **não grava
nada** — é consulta/sugestão).

Fluxo: normaliza o CNPJ (14 dígitos) → `GET minhareceita.org/{cnpj}` → mapeia
para um DTO normalizado que o formulário de cliente usa para pré-preencher, e
que já traz as coleções dos cadastros filhos.

### Mapeamento (MinhaReceita → plataforma)

Campos do cliente:

| MinhaReceita | Cliente |
|---|---|
| `razao_social` | `razaoSocial` |
| `nome_fantasia` | `nomeFantasia` |
| `cnpj` | `cnpjCpf` |
| `descricao_situacao_cadastral` / `situacao_cadastral` | informativo (sugere `ativo`) |
| `logradouro` + `numero` | `endereco` |
| `complemento` | `complemento` |
| `bairro` | `bairro` |
| `municipio` (+ `codigo_municipio_ibge`) | `municipio` (resolve por código IBGE) |
| `uf` | `uf` |
| `cep` | `cep` |
| `ddd_telefone_1` | `telefone` |
| `ddd_telefone_2` | `telefone2` |
| `email` | `email` |

Coleções (alimentam os cadastros filhos — ver
[`cadastros-cliente-cnae-contatos-socios.md`](./cadastros-cliente-cnae-contatos-socios.md)):

- `cnae_fiscal` (+ `cnae_fiscal_descricao`) → CNAE **principal**;
  `cnaes_secundarias[] { codigo, descricao }` → CNAEs secundárias. Casa cada
  código com a tabela `cnaes` (populada pelo IBGE); código ausente na referência
  → inclui como texto e/ou reporta.
- `qsa[] { nome_socio, qualificacao_socio, faixa_etaria,
  data_entrada_sociedade, cnpj_cpf_do_socio, ... }` → **sócios**.
- `ddd_telefone_1`/`ddd_telefone_2`/`email` → sugestão de **contatos** iniciais.

### Como é usado (não é gravação automática)

O `GET consulta-cnpj` só **retorna** os dados. A tela de cliente mostra um botão
"Consultar CNPJ" que preenche os campos e lista os CNAEs/sócios/contatos
sugeridos; o usuário revisa e salva. No salvamento, o cliente e as coleções
filhas são persistidos pelos endpoints normais (ver plano dos cadastros filhos).
Isso evita sobrescrever edição manual e mantém o humano no controle.

## Fase 4 — Swagger

Os três endpoints (`ceps/consulta/:cep`, `clientes/consulta-cnpj/:cnpj`) e o
comando de sync entram no Swagger com `@ApiOperation`, `@ApiParam` (exemplos de
CEP/CNPJ), `@ApiResponse` 200 (com exemplo do DTO normalizado), 404 (não
encontrado) e 502 (fonte indisponível). Exemplos normalizados vivem em
`contracts` (`VIACEP_RESULTADO_EXAMPLE`, `CNPJ_ENRIQUECIMENTO_EXAMPLE`).

## Fase 5 — Verificação

1. `sync:ibge` popula 27 estados, ~5.570 municípios e a referência de CNAEs;
   reexecução não duplica.
2. `ceps/consulta` de um CEP novo chama ViaCEP, persiste e resolve
   estado/município; segunda chamada bate no cache (sem HTTP externo).
3. `consulta-cnpj` de um CNPJ real devolve razão social, endereço, CNAEs e QSA
   mapeados; CNPJ inexistente → 404; MinhaReceita fora → 502.
4. Front: CEP preenche endereço; "Consultar CNPJ" preenche cliente + listas.
5. Resiliência: com as fontes externas offline, os cadastros manuais continuam
   funcionando (degradação graciosa).

## Fora de escopo (registrado)

- Cron de refresh do IBGE (v1 é sync manual/no deploy; a base muda pouco).
- Enriquecimento em massa dos ~6.6 mil clientes já importados (pode virar um
  script `enrich:clientes` depois, iterando CNPJs pela MinhaReceita com
  paralelismo cortês).
- Webhook/assinatura de mudanças da Receita — não existe; o modelo é consulta
  sob demanda.
- Validação fiscal (situação cadastral bloqueando venda etc.) — aqui só se
  capta o dado; regra de negócio fica para outra iniciativa.

### Arquivos críticos (quando implementar)

- `apps/api/src/common/external-http/**` (cliente HTTP com timeout/log)
- `apps/api/prisma/sync-ibge.ts` + script `sync:ibge` (estados/municípios/cnaes)
- `apps/api/src/modules/cadastros/ceps/**` (endpoint `consulta/:cep` + cache)
- `apps/api/src/modules/clientes/**` (endpoint `consulta-cnpj/:cnpj` + mapeamento)
- `packages/contracts/src/enriquecimento.ts` (DTO normalizado + exemplos Swagger)
- `apps/web/src/components/crud/cliente-form.tsx` (botão CNPJ + auto-preencher CEP)
