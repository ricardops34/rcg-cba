# Plano: carga inicial por arquivo

> **Status (28/09/2026): código pronto dos dois lados, nada validado de ponta a ponta.**
> API: compila e os testes unitários passam; a migration ainda não foi aplicada
> (Docker parado). Protheus: fontes escritos, não compilados. Ver *Andamento*.
> Opção **extra** de envio — não
> substitui a fila (SZY/SZZ) nem o `PUT` em bloco. Pedido do usuário depois da
> carga de 25/09, que ficou dias "processando".
>
> **Decisão do usuário (28/09): manter todas as formas de envio.** A fila, o
> Enviar em Bloco e o `PUT` continuam como estão; nada do que entrou em 26/09
> (pesos de carga, fatias, superada) é removido ou simplificado por causa
> deste caminho.

## O problema

A carga inicial passava pelo caminho do dia a dia: cada registro gravado na
SZZ, lido de novo, enviado. Em 25/09 isso segurou a integração por dias (ver
[2026-09-26-filas-prioridade-integracao.md](2026-09-26-filas-prioridade-integracao.md)).
A fila existe para o incremental — marca d'água, reenvio, prioridade,
mensagem superada — e na carga tudo isso é peso morto.

## Desenho

O Protheus gera **um arquivo por entidade**, compactado, e manda cada um numa
requisição só. A plataforma guarda o arquivo, responde na hora (202) e
processa em segundo plano. O Protheus fica livre assim que o upload termina.

### Formato do arquivo

**JSON Lines** — uma linha por registro, a linha é o mesmo item do `PUT` em
bloco daquela entidade, envelopado com o nome dela:

```jsonc
{"entidade":"categorias","registro":{"chave":"01-000001","codigoErp":"000001","descricao":"MATERIAL ELETRICO","ativo":true}}
{"entidade":"categorias","registro":{"chave":"01-000009","excluido":true}}
```

- O `registro` é validado **pelo mesmo schema** do `PUT /integracao/<entidade>`
  e gravado **pelo mesmo `upsertLote`**. Não é um segundo contrato: o que
  passa no `PUT` passa no arquivo, com a mesma mensagem de erro.
- Um arquivo pode misturar entidades; elas são aplicadas **na ordem das
  linhas**. O Protheus manda um por entidade porque é o que ele gera em
  streaming sem segurar tudo na memória.
- **gzip é opcional.** A API reconhece o arquivo compactado pelos dois
  primeiros bytes (`1f 8b`) e aceita o texto puro também — se a build do
  Protheus não tiver compactação, a carga funciona igual, só maior.

### API

| Rota | O quê |
|---|---|
| `POST /integracao/cargas?descricao=...` | Corpo = o arquivo (`application/gzip` ou `application/x-ndjson`). Confere a estrutura e responde **202** com o id e as linhas por entidade |
| `GET /integracao/cargas` | As últimas cargas da empresa |
| `GET /integracao/cargas/{id}` | Situação e progresso |
| `GET /integracao/cargas/{id}/erros?page=` | Registros recusados: linha, entidade, chave, motivo |
| `POST /integracao/cargas/{id}/cancelar` | Para no fim do bloco em andamento |

**O que recusa o arquivo inteiro (400), sem gravar nada:** gzip corrompido,
linha que não é JSON, linha sem `entidade`/`registro`, entidade fora das 15
aceitas, arquivo vazio, acima de **100 MB** recebidos. É erro do gerador, não
do dado — processar metade de um arquivo malformado só confundiria.

**O que não recusa:** registro que não passa no schema ou que a gravação
rejeita (vendedor inexistente, por exemplo). Vai para a lista de erros da
carga, com a linha, e o resto segue — a mesma regra do `PUT`.

### Processamento

- **Uma carga por vez por empresa, na ordem de chegada.** É o que preserva a
  dependência entre entidades: o Protheus sobe na ordem do catálogo, e a de
  títulos só começa depois que a de vendedores e clientes terminou.
- Blocos de **1.000 linhas da mesma entidade**, pelo `upsertLote` da entidade.
- **Retomável:** depois de cada bloco grava `linhasProcessadas`. Se a API
  reiniciar no meio, a carga volta dali — refazer o bloco interrompido não
  duplica nada, o upsert é por chave.
- **Batimento** (`atualizadoEm`) a cada bloco. Carga em `processando` há mais
  de 10 minutos sem avanço é retomada por outra rodada — é a API que caiu, não
  a carga que está lenta.
- Varredura a cada 15 s, pelo mesmo molde do `WhatsappAgendamentoService`: a
  tabela tem RLS, então percorre empresa por empresa. A troca
  `recebida → processando` por `updateMany` condicional é a trava entre
  réplicas.

### Tabelas (RLS na mesma migration)

- `integracao_cargas` — o arquivo (`bytea`, sempre guardado compactado),
  situação, contadores, `linhasProcessadas`, batimento, chave de API que
  enviou.
- `integracao_carga_erros` — uma linha por registro recusado. Tabela à parte
  porque a carga de 25/09 teria dezenas de milhares de erros de um vendedor
  só, e um JSON na linha da carga cresceria sem teto.

### Protheus

- **`U_BJCARGARQ`** (BJPLA004): para cada entidade do catálogo, na ordem de
  carga, chama o mapeador em modo carga (sem marca, sem excluídos), grava as
  linhas num arquivo local, compacta se puder e sobe. Fica com o id de cada
  carga para o monitor consultar.
- **Marca d'água:** terminados os uploads **aceitos**, grava um lote na SZY
  com a marca = início da geração − 10 min (mesma margem do `U_BJVARRE`),
  sem mensagens na SZZ. A partir dela o `U_BJVARRE` segue só incremental.
- **`U_BJVARRE` precisa mudar:** hoje ele trata "SZZ sem mensagem de saída"
  como carga inicial, mesmo com marca gravada. Com a carga por arquivo a SZZ
  fica vazia de propósito — a marca existente passa a vencer.
- Monitor (BJPLA005): botão **Carga por Arquivo** e consulta da situação.

### Fora do escopo agora

- **XML das notas** (`notas-saida-xml`): rota própria, por chave, e é
  histórico (ver a prioridade dos dados). Continua pelo caminho atual.
- ~~Tela na plataforma~~ — **entrou no escopo em 28/09/2026**, ver *Tela de
  cargas* abaixo.
- **Gravação em massa no servidor.** O processamento continua ~6,9 ms por
  registro (104 mil títulos ≈ 12 min), igual ao `PUT`. O ganho do arquivo é
  tirar a SZZ do caminho e liberar o Protheus, não acelerar a API.

### Tela de cargas (decisão do usuário, 28/09/2026)

Os arquivos passam a poder vir também do **SQL** (`docs/integracao/sql/`), sem
o Protheus. Para subir esses arquivos, uma tela em **Administração >
Integração**: upload de vários arquivos e acompanhamento do processamento.

- **Login do usuário, não chave colada** (opção B do usuário). Rotas próprias
  em `/integracao-cargas`, com `JwtAuthGuard` e a permissão que já protege a
  tela: `integracao.visualizar` para ver, `cadastrar` para subir, `editar`
  para cancelar. Sem rotina nova, sem migration de permissão.
- **A carga fica em nome de uma chave de API da empresa**, escolhida na tela.
  Os registros gravados levam a autoria da integração, como os que o Protheus
  manda — a origem do dado é o ERP, não a pessoa que subiu o arquivo.
- **Mesma gravação das APIs de carga.** O processamento é o do
  `CargasProcessador`: schema e `upsertLote` do `PUT /integracao/<entidade>`.
  Não é um segundo código de carga.
- **O "Importar TXT Protheus" (`/integracao/arquivo/importar`) não serve para
  isso:** chama o `upsert` sem o schema (datas e chaves chegam cruas),
  processa dentro da requisição (o proxy do Next corta em 30 s) e aceita até
  24 MB. Fica como está; aposentar é outra decisão.
- **Tamanho:** o Next 16 corta em 10 MB o corpo que passa pelo proxy
  (`proxyClientMaxBodySize`). O navegador compacta o arquivo em gzip antes de
  subir (JSON cai ~10×), e o limite do proxy sobe para 100 MB, o mesmo da API.
- **A tela sobe na ordem de carga**, qualquer que seja a ordem em que os
  arquivos foram escolhidos: a plataforma processa na ordem de chegada.

## Decisões em aberto

1. **Compactação no Protheus** — confirmar qual função de gzip a build tem
   (`GzStrComp`/`GzCompress`). Sem ela, manda texto puro.
2. **Limite de 100 MB por arquivo** — suficiente para a base medida (119 mil
   registros); se uma entidade passar disso compactada, o Protheus divide.

## Andamento

**28/09/2026**

- **API** — módulo `integracao/cargas`, migration `20260928150000_integracao_cargas_arquivo`
  e o contrato em `packages/contracts`. `tsc` limpo; 13 testes unitários
  (leitura do arquivo e aplicação do bloco) passando. **Falta:** aplicar a
  migration no dev e mandar um arquivo real com o container reiniciado.
- **Protheus** — `U_BJCARGARQ` (BJPLA004), `U_BJCORTE` e `U_BJMARGEM` extraídos do
  `U_BJVARRE` (BJPLA003) para as duas cargas lerem o mesmo recorte, `U_BJHTTP`
  com Content-Type opcional (BJPLA002) e os botões **Carga por Arquivo** e
  **Cargas na Plataforma** (BJPLA005). **Não compilado.**
- **`U_BJVARRE`**: só a falta de marca decide que é carga inicial; a consulta
  "SZZ sem mensagem de saída" saiu.

Decisões tomadas na implementação (revisáveis):

- **Partes de 8 MB de texto**, e não 100 MB: o arquivo é lido numa string para o
  envio, e o teto é o `MaxStringSize` do `appserver.ini`. Os 100 MB da API
  continuam como teto do lado de lá.
- **Os ids das cargas não ficam no Protheus**: o monitor consulta
  `GET /integracao/cargas`, que já lista as últimas da empresa.
- **A carga segura a trava `BJPLA_COLETA`** — sem ela, o `U_BJVARRE` agendado
  acharia a SZY sem marca e começaria a carga pela fila ao mesmo tempo.
- **O botão avisa se há mensagens de saída pendentes na fila**: enviadas depois
  da carga, levam à plataforma um estado mais antigo que o dela.
- **Compactação**: `GzCompress(origem, destino)`, protegido; só vale se o
  resultado começar por `1f 8b`. Fora disso manda o texto.

A conferir no primeiro teste no Protheus:

1. O `GzCompress` existe na build e gera gzip (o console diz `application/gzip`
   ou `application/x-ndjson` em cada parte).
2. O `HTTPQuote` manda o corpo binário inteiro (a API recusaria gzip truncado
   com 400 "gzip corrompido").
3. **Acentuação**: o arquivo leva os bytes do `ToJson()`, como o `PUT`, mas por
   `HTTPQuote` e não `FWRest`. Conferir uma descrição com acento na plataforma.

**28/09/2026 (tarde) — tela de cargas**

- **API:** `IntegracaoCargasAdminController` em `/integracao-cargas` (login +
  permissão `integracao`), upload multipart, e `conferirChave` no service.
  **Web:** aba **Cargas por arquivo** em Administração > Integração
  (`cargas-tab.tsx`); `proxyClientMaxBodySize: "100mb"` no `next.config`.
- **Testado em dev, ponta a ponta:** migration aplicada; upload gzip de 6 linhas
  → 202 → processada em ~15 s: 5 criados, 1 recusado com linha/chave/motivo.
  No banco: datas civis gravadas como data, número decimal, vendedor em branco
  virou nulo, autoria `integracao:<chave>`. Upload de 15 MB pelo proxy do Next
  chegou inteiro (59.354 linhas contadas).
- **Achado:** a API grava a `chave` do registro **com** os espaços do campo (o
  item de lote não faz trim na chave principal, só nas de referência) — igual
  pelo `PUT` e pelo arquivo. O SQL concatena como o ADVPL, então bate.
- **Não conferido:** a tela no navegador (só compilação e HTTP 200 da página).
- O Prisma Client do container de dev estava desatualizado há vários commits
  (81 erros de compilação): precisou de `prisma generate` no container.

