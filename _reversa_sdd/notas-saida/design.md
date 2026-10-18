# notas-saida — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `notas-saida`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll(empresaId, user, query, opcoes?)` | `filtros (`ativo`, `clienteId`, `vendedorId`, `comodato`, `tipo`, `devolucao`, `ano`, `mes`, `search`) + paginação/ordenação` | `lista paginada com `cliente`/`fornecedor`/`vendedor` embutidos + flag `temXml`` | Média — escopo por carteira + filtro de devolução (§3.1) |
| `findOne(empresaId, user, id, opcoes?)` | `id da nota` | `nota com cliente, fornecedor, vendedor, condição de pagamento e itens (produto, regra de desconto); comissão ocultada conforme parâmetro` | Média — escopo por carteira + ocultação de comissão |
| `obterXml(empresaId, user, id, opcoes?)` | `id da nota` | ``{ conteudo: Buffer XML, nomeArquivo, clienteId, vendedorId }`` | Baixa — delega a `lerXml`, registra evento |
| `lerXml(empresaId, quem, id) *(privado)*` | `id da nota` | ``{ nota, conteudo: Buffer }`` | Média — resolve escopo por `QuemPede` (usuário ou cliente no WhatsApp), 404/409 |
| `registrarEvento(...) *(privado)*` | `nota, autor, evento, detalhes` | `grava atividade no histórico do cliente` | Baixa |

## Fluxo Principal

### 1. 3.1 Escopo por carteira usa o vendedor do **cliente**, não o da nota

Comentário explícito no topo do service: `notaSaida.vendedorId` é quem efetivamente fez a
venda (exibido na tela), mas o filtro de "quem pode ver esta nota" usa
`cliente.vendedorId` (o vendedor do CADASTRO do cliente). Efeito: uma nota registrada por
outro vendedor cobrindo a carteira continua visível para quem enxerga aquele cliente.
Implementado via `combinarFiltroVendedor(escopo, query.vendedorId)` sobre a relação
`cliente` em `findAll`, e via `cliente: { vendedorId: { in: escopo } }` em `findOne`
(mesmo mecanismo de `resolverEscopoVendedores` usado em `clientes`/`notas-entrada`).

### 2. 3.2 Devolução de compra (`tipo = 'D'`) não tem dono de carteira

`query.devolucao === true`: filtro vira `{ tipo: 'D' }` e **ignora** o filtro de
vendedor/cliente — se `escopo` não é `null` (usuário restrito), o `where` força
`{ id: { in: [] } }` (nunca retorna nada), porque a devolução não tem cliente associado
(destinatário é fornecedor) e não há carteira que a enxergue. Só quem vê tudo
(`escopo === null`) lista devoluções. `query.devolucao === false` exclui esse tipo
explicitamente (`tipo: null OU tipo != 'D'`); `devolucao` ausente não filtra por tipo.
Mesmo padrão do `TIPO_DEVOLUCAO` em `notas-entrada`, mas invertido (lá a devolução é do
cliente; aqui, do fornecedor).

### 3. 3.3 `lerXml` — leitura em duas etapas, sem o XML na consulta de escopo

O `select` da consulta de nota **não inclui** `xml.conteudo`: o conteúdo mora em
`NotaSaidaXml`, tabela acessória, e só é buscado (`findUnique` por `notaSaidaId`) depois
que o escopo já aprovou o acesso à nota. Isto evita que a listagem ou qualquer consulta
intermediária arraste megabytes de XML sem necessidade (mesmo racional de design documentado
no schema da tabela). Resolve o recorte via `recorteDoSolicitante(tx, empresaId, quem)`
— `quem` é `QuemPede` (`{ tipo: 'usuario', user }` ou cliente via WhatsApp), que devolve
tanto `escopoVendedores` (lista ou null) quanto `clienteId` (quando quem pede é o próprio
cliente, recorte adicional por `clienteId`). Nota inexistente/fora de escopo → 404; nota
sem XML ainda recebido → 409 com mensagem explicando que o ERP precisa enviá-lo antes.

### 4. 3.4 `gerarDanfe` — XML → dados → PDF → evento condicional

Ver `flowcharts/notas-saida-gerarDanfe.md` para o fluxo completo. Pontos centrais:
- Erro de parsing do XML (`NfeXmlInvalidoError`) vira 409 com o número da nota e a causa —
  nunca um PDF vazio ou "inventado" a partir das colunas da tabela (comentário explícito em
  `danfe-pdf.ts`: o documento é a representação do que a SEFAZ autorizou, não um recálculo).
- Logo do emitente: tenta `empresa.logoDanfeUrl` primeiro, cai para `empresa.logoUrl`; a
  consulta de `Empresa` é feita **fora** da transação de tenant (`Empresa` não é tabela de
  tenant), mesmo padrão do PDF de orçamento.
- O evento no histórico (`danfe_gerado`) só é registrado **depois** que o PDF existe — XML
  ilegível vira 409 sem deixar rastro de uma 2ª via que ninguém recebeu.
- `opcoes.registrarEvento === false` desliga o registro automático para quem já grava um
  evento mais específico (ex.: o fluxo de WhatsApp grava "DANFE enviado" em vez de "DANFE
  gerado").

### 5. 3.5 Parser de XML próprio, com defesas explícitas contra XXE (`nfe-xml.ts`)

`lerXml` (em `nfe-xml.ts`, não confundir com o método privado do service de mesmo nome)
constrói a árvore do documento com regex, não com um parser XML genérico. Comentário no
topo do arquivo justifica a escolha: o XML já veio validado pela SEFAZ contra o schema da
NF-e, então não há necessidade de um parser completo — e trazer um parser genérico
traria junto a superfície de XXE (entidades externas, DTD). Duas garantias de segurança:
- **DOCTYPE, `<!ENTITY>` e instruções de processamento são descartados** no pré-processo,
  antes de qualquer parsing — sem resolução de entidade não há XXE nem billion-laughs.
- **Profundidade máxima de pilha = 60** (`PROFUNDIDADE_MAXIMA`): um XML forjado com
  aninhamento profundo lança `NfeXmlInvalidoError` em vez de estourar a pilha do processo.
- `NFE_XML_MAX_BYTES = 5 MiB` é o teto aceito na ingestão (não reforçado neste arquivo —
  é um limite documentado para quem grava `NotaSaidaXml`, já que uma NF-e de 990 itens
  não passa de ~2 MB).

`extrairNfe` aceita tanto `nfeProc` (nota + protocolo de autorização — o que o ERP deve
mandar) quanto `NFe` sozinha; sem `nfeProc` o DANFE sai sem protocolo, carimbado "SEM VALOR
FISCAL" (ver §3.6), nunca como se tivesse sido autorizado. Cancelamento é inferido do
`cStat` do protocolo (`101`, `135`, `151`, `155` = cancelamento homologado).

### 6. 3.6 `montarDanfePdf` — paginação de itens e carimbos (`danfe-pdf.ts`)

Reproduz o layout do DANFE retrato que o Protheus imprime (pedido do usuário, 01/10/2026,
tendo o PDF do ERP como modelo) — mesmos quadros, mesma ordem, mesma composição de campos.
Primeira folha: canhoto, cabeçalho, destinatário, fatura, impostos, transporte e o quadro
de itens que cabem antes do rodapé fixo (`ALTURA_RODAPE`); itens que não couberem
continuam em folhas seguintes, cada uma repetindo o cabeçalho. `escreverItens` devolve o
índice de parada quando a próxima linha não cabe mais no quadro (considerando que a
descrição pode quebrar em várias linhas); se um item sozinho não cabe nem numa folha vazia,
o loop para (`proximo === antes`) para não entrar em loop infinito. O número de folhas só
é conhecido no final — por isso "FOLHA x/y" é escrito numa segunda passada
(`folhas: MarcaFolha[]` guarda página/posição de cada cabeçalho). Carimbo
("NF-e CANCELADA" ou "SEM VALOR FISCAL") é desenhado por último, em todas as páginas, para
ficar por cima do conteúdo. **Não recalcula nenhum valor fiscal** — todo número vem
literalmente do XML (`decimal()` só formata).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`resolverEscopoVendedores + combinarFiltroVendedor (common/escopo/escopo-vendedores)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`QuemPede + recorteDoSolicitante + autorDoEvento (common/escopo/quem-pede)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`registrarAtividadeDocumento (common/atividades)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ocultarComissaoDosItens (common/permissoes/pode-ver-comissao)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`carregarLogo (common/pdf/carregar-logo)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`code128cModulos + desenharBarras + larguraBarras (common/pdf/barcode)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`jspdf`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** whitelist de ordenação; fora da lista cai no default | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `default de ordenação`:** quando `sortBy` não é informado ou não está na whitelist | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `TIPO_DEVOLUCAO`:** marca devolução de compra (destinatário = fornecedor) | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `NFE_XML_MAX_BYTES (nfe-xml.ts)`:** teto do XML aceito na ingestão | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `PROFUNDIDADE_MAXIMA (nfe-xml.ts)`:** teto de aninhamento do parser próprio | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `MODALIDADE_FRETE (danfe-pdf.ts)`:** tradução do `modFrete` do XML para o texto impresso no DANFE | `apps/api/src/modules/notas-saida` | 🟢 |
| **Constante Parametrizada `cStat de cancelamento (nfe-xml.ts)`:** marca `cancelada: true` em `extrairNfe` | `apps/api/src/modules/notas-saida` | 🟢 |

## Estado Interno e Entidades

- **`NotaSaida`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`NotaSaidaItem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`NotaSaidaXml`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

