# produtos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `produtos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `ProdutosService` | `CRUD, listagem com filtros/busca, preços por tabela (`precos`), opções de filtro, fotos (upload, principal, remoção)` | `Result` | 200 OK |
| `ProdutoRelacionadosService` | `CRUD de similares/aplicação, lidos dos dois lados; recusa produto de categoria "equipamento de comodato" como aplicável` | `Result` | 200 OK |
| `ProdutoFichasService` | `CRUD de ficha técnica (PDF + Markdown), delega reindexação ao `FichaEmbeddingService`` | `Result` | 200 OK |
| `FichaImportacaoService` | `Fila de importação de fichas por PDF: upload grava e devolve, varredura (`setInterval`) lê cada PDF via provedor de IA e vincula ao produto pelo conteúdo` | `Result` | 200 OK |
| `FichaEmbeddingService` | `Parte a ficha em trechos (`partirFicha`), indexa (apaga e refaz) e vetoriza os pendentes em lote` | `Result` | 200 OK |
| `ProdutoFotosImportacaoService` | `Importação de fotos em lote, vínculo por código extraído do nome do arquivo` | `Result` | 200 OK |
| `ProdutoParaAgenteService` | `Busca híbrida (lexical + semântica) e dossiê de produto para a IA — nunca lê `ultimoPreco`` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Trava de campos do ERP (`CAMPOS_DO_ERP`)

`update` só compara e bloqueia os campos de `CAMPOS_DO_ERP` quando o produto tem `chave`
(veio do import) **e** o valor enviado difere do gravado — o formulário manda o objeto
inteiro, então comparar evita recusar um "salvar" que não tocou em nada do ERP. Produto
sem `chave` (nascido na plataforma) é editável por inteiro. `remove` aplica a mesma régua:
produto com `chave` não pode ser excluído pela API (`BadRequestException`) porque o
próximo import o recriaria — a exclusão real é no Protheus. 🟢

### 2. 3.2 Preço por tabela com herança de regra de desconto (`precos`)

Monta, por item de tabela de preço ativa, a regra de desconto que vale naquela linha, na
mesma precedência do orçamento (`resolverRegrasDescontoDosItens`): produto → item da
tabela → categoria do produto → regra padrão da empresa. Comentário no código registra que
a precedência "produto antes da tabela" é decisão do usuário de 2026-10-13 — mudou de
ordem em algum momento.

### 3. 3.3 Fichas técnicas — extração por IA e corte de preço (`FichaImportacaoService`,

`ProdutoFichasService`, `sem-preco.ts`) 🟢

- **Upload não processa**: grava os PDFs (`ProdutoFichaImportacao`) e devolve; uma
  varredura própria (`setInterval` de 5s, com trava de reentrada `rodando`) lê 1 PDF por
  vez por empresa, com até 3 tentativas antes de marcar `erro` — chamada cara a provedor
  de IA, lote não cabe numa requisição HTTP.
- **Quem decide o produto é o servidor, não o modelo**: o provedor devolve código e nome
  lidos do documento; `procurarProduto` busca no catálogo por código (fornecedor, ERP,
  barras — exato) e só cai para nome (com `sem_acento`, mínimo 4 caracteres) se nenhum
  código bateu. Um resultado → vincula e grava a ficha; zero ou mais de um → situação
  `sem_correspondencia`/`ambiguo`, decisão fica para uma pessoa na tela. Motivação
  explícita no código: se o modelo devolvesse um id, bastaria alucinar um para pendurar a
  ficha no produto errado, sem ninguém perceber até um vendedor mandar a ficha errada a um
  cliente.
- **`sem-preco.ts` — regra "a IA nunca passa preço" é código, não prompt**: `linhaTemPreco`
  reconhece `R$`/`US$`, palavras-chave (`preço`, `custo`, `desconto`, `condição de
  pagamento`...) e remove a linha inteira; deliberadamente **não** inclui "valor" sozinho
  (apareceria em "valor de pH", removeria conteúdo técnico legítimo). Comentário no código
  é explícito sobre a escolha de errar removendo demais — ver a doc do arquivo.
  `FichaEmbeddingService.indexar` vetoriza o Markdown **depois** do `semPreco`;
  `ProdutoParaAgenteService.detalhar` aplica `semPreco` de novo no conteúdo devolvido à IA
  — defesa em duas camadas (o que é indexado e o que é lido).
- **Reindexação é apagar e refazer** (`FichaEmbeddingService.indexar`): guardar diff entre
  versões de Markdown custaria mais do que regerar, e um trecho velho sobrevivendo à edição
  deixaria buscável um texto que a pessoa acabou de remover.
- **Vetorização tolerante a ausência de provedor**: sem embeddings configurados, os trechos
  ficam só com texto (busca lexical atende); `vetorizarPendentes` varre depois, em lote de
  32, teto de 200 por chamada.

### 4. 3.4 `partir-ficha.ts` — particionamento de Markdown para embedding

Alvo de ~800 caracteres por trecho (equilíbrio entre contexto suficiente e diluição do
vetor), corte por `\n\n` (respeita a estrutura do documento), blocos menores que 120
caracteres grudam no trecho anterior/seguinte (título de seção sozinho não responde nada),
blocos muito grandes (>1,5× o alvo) são cortados por linha. Teto de 60 trechos por ficha.
O título do documento é repetido no início de cada trecho que não já o contém, para o
vetor do trecho apontar ao produto certo mesmo isolado do resto.

### 5. 3.5 Busca híbrida para a IA (`ProdutoParaAgenteService.procurarHibrido`/`procurar`)

- **Lexical "candidatos primeiro, pontuação depois"**: cada termo da busca gera um braço de
  `UNION ALL` (descrição/marca/código/categoria do produto, campos complementares visíveis
  ao agente, texto de ficha visível ao agente), usando `sem_acento(...) ILIKE` (não
  `unaccent`, que não usa o índice GIN de trigramas da migration `20260906000000`) —
  medido em dev: 1139ms pontuando tudo vs. 0,8ms por candidatos primeiro, com 4.000
  produtos/fichas.
- **`palavrasDaBusca`**: remove conectivos/pronomes e palavras do próprio domínio (lista
  `VAZIAS`, ~60 termos) que casariam com o catálogo inteiro; teto de 6 palavras; busca só de
  palavras vazias cai para o texto inteiro (evita devolver o catálogo sem filtro).
  Pontuação por produto = nº de palavras que casaram (não exige todas, para não perder o
  produto certo por uma palavra solta da frase).
  🟢 (testado em `palavras-da-busca.spec.ts`)
- **Semântica**: distância de cosseno (`<=>`, índice HNSW) sobre `produto_ficha_trechos`,
  `DISTINCT ON (produtoId)` para uma ficha longa não ocupar o resultado com vários trechos
  do mesmo produto; filtra só trechos vetorizados e fichas `visivelAgente`.
- **Combinação**: soma por posição (`1/(posição+1)`, não pela distância bruta — cosseno e
  contagem de palavras não são comparáveis), semântica pesando 1,3× a lexical. Sem
  provedor de embeddings, `gerarUm` devolve `null` e sobra só a lexical.

### 6. 3.6 Similares e aplicação — leitura dos dois lados, regra de categoria (`ProdutoRelacionadosService`)

- `listar`/`listarTx` junta as relações que partem do produto e as que chegam, marcando
  `origem` — sem isso quem abre o "produto B" não veria que A o usa.
  `similar` é simétrico (gravado uma vez, lido nos dois lados; `criar` rejeita duplicar o
  inverso com `ConflictException`); `aplicacao` é direcional (mesma relação, rótulo
  diferente em cada ponta: "usa"/"usado em").
  `remover` aceita o id pela ponta aberta na tela, seja origem ou destino.
- `recusarCategoriaDeEquipamento`: um produto marcado como categoria/subcategoria de
  "equipamento de comodato" não pode entrar como `aplicacao` (o dispenser não "usa" outro
  dispenser) — decisão do usuário, 2026-10-07. Mora aqui e não na tela de Equipamentos de
  Comodato porque o card "Relacionados" do produto grava a mesma relação; pôr a regra só
  numa tela deixaria a outra como atalho.

### 7. 3.7 Importação de fotos por nome de arquivo (`codigosDoNome`)

Extrai candidatos do nome do arquivo (sem extensão) e uma variante sem sufixo
`_2`/` principal`, com precedência para o nome completo (só cai para a variante sem
sufixo quando a correspondência exata não achou nada). Critério de busca é parametrizável
(`codigo_erp`, `codigo_fornecedor`, `manual`); zero ou mais de um produto encontrado grava
a foto sem vínculo (`produtoId: null`), pendente de decisão manual.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ProvedorIaModule/ProvedorFactory`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`AgenteConfigService (agente)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`EmbeddingsService (agente)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads/uploads.config`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/empresa/situacao-empresa`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `CAMPOS_DO_ERP`:** trava de edição em produto com `chave` | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** whitelist de ordenação da listagem | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `ALVO / MINIMO / MAXIMO_TRECHOS (partir-ficha.ts)`:** tamanho-alvo do trecho, limiar de "grudar", teto por ficha | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `INDICIOS (sem-preco.ts)`:** o que denuncia preço numa linha de ficha | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `FichaImportacaoService.INTERVALO_MS / POR_RODADA / MAX_TENTATIVAS`:** cadência e paralelismo da varredura de PDFs | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `FichaEmbeddingService.LOTE`:** trechos por chamada ao provedor de embeddings | `apps/api/src/modules/produtos` | 🟢 |
| **Constante Parametrizada `VAZIAS (produto-para-agente.service.ts)`:** stop-words da busca da IA | `apps/api/src/modules/produtos` | 🟢 |

## Estado Interno e Entidades

- **`Produto`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoFoto`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoFicha`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoFichaTrecho`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoFichaImportacao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoRelacionado`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

