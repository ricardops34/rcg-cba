# armazenamento — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `armazenamento`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Comportamento` | `Result` | 200 OK |
| `GET /plataforma/armazenamento/situacao` | `S3 configurado?, bucket, teste de conexão (`HeadBucket`) e, por pasta do S3, quantos arquivos ainda estão em disco` | `Result` | 200 OK |
| `POST /plataforma/armazenamento/migrar {pasta}` | `uma rodada de até 200 arquivos do disco para o S3; `pasta` casa `^[a-z0-9-]+$`` | `Result` | 200 OK |
| `POST /plataforma/armazenamento/midia-orfa {apagar}` | ``false` lista os órfãos; `true` apaga` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 A classe `Armazenamento` (núcleo)

- **Singleton por função** (`armazenamento()`), não injeção do Nest, porque quem grava
  inclui funções soltas (`apagarArquivosDaMidia`) e o middleware do `main.ts`.
- **`configDoAmbiente`**: S3 só existe com as **quatro** variáveis preenchidas
  (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`); faltando uma, tudo fica
  em disco sem aviso. `S3_ENDPOINT_PUBLICO` cai no interno; região padrão `us-east-1`;
  `forcePathStyle: true` (MinIO).
- **Dois clientes S3**: o interno (`http://minio:9000`) para gravar e ler, e o **público**
  (`https://s3.rcgdist.com.br`) só para **assinar** o link temporário, porque a
  assinatura cobre o host.
- **`noS3(chave)`** = há S3 ∧ primeiro segmento ∈ `ARMAZENAMENTO_S3_PASTAS`.
- **Gravar** vai para um lugar só (S3 se a pasta está nele, senão disco).
  `gravarArquivo` faz stream para o S3 (pacote de backup) ou `copyFile` no disco.
- **Ler** procura no S3 e, não achando (404/`NoSuchKey`), no disco: os arquivos de antes
  da troca continuam servidos até serem copiados. Não existe em lugar nenhum → `null`.
- **Apagar** remove dos dois; não existir não é erro.
- **`listar(pasta)`** une disco (recursivo, com subpastas) e S3 (`ListObjectsV2` paginado)
  num `Map` por chave; o S3 sobrescreve o disco.
- **`validarChave`**: recusa vazio, `/` inicial, `\`, segmentos `.`/`..`/vazios e qualquer
  chave que `normalize` altere. Um nome vindo do banco nunca escapa de `uploads/`.
- **`chaveDoEndereco`**: `/uploads/x?exp=…` → `x` (decodificado e validado); outro
  endereço → `null`.

### 2. 3.2 Servir `/uploads` (middleware do `main.ts`)

Ordem das conferências: caminho normalizado → `agente/`, `fichas-importacao/` e `.tmp/`
dão **404** → prefixo assinado (mídia do WhatsApp) e `backups/` exigem **link assinado
válido** (403) → se a chave está numa pasta do S3, `linkTemporario` faz `HeadObject` e
**redireciona (302)** para o link pré-assinado de **1 h**; sem o objeto lá, segue para o
estático do disco; erro do S3 → 502.

### 3. 3.3 Migração disco → S3 em rodadas — `migrarParaS3(pasta, 200)`

Só para pasta já configurada no S3. Para cada um dos primeiros 200 arquivos em disco:
`PutObject` com o conteúdo lido inteiro (`readFile`) → `HeadObject` confere
`ContentLength` = tamanho em disco → só então `unlink`. Falha de um arquivo entra em
`falhas` e não interrompe. Devolve `{copiados, bytes, falhas, restantes}`; a tela chama
de novo até `restantes` zerar.

### 4. 3.4 Varredura de mídia órfã do WhatsApp — `MidiaOrfaService.varrer`

Origem dos órfãos: até 2026-10-13 a exclusão do histórico apagava mensagens e deixava os
arquivos; a foto de contato substituída fica; anexo cujo envio falhou fica como o multer
gravou.

1. Lista `whatsapp/` (disco + S3, inclusive `whatsapp/<empresaId>/` e os soltos).
2. **Referenciados** = `whatsapp_mensagens.arquivoUrl` ∪ `whatsapp_contatos.fotoUrl` de
   **todas** as empresas: lista as empresas em **modo sistema** (inclusive excluídas) e
   lê cada uma **em sequência** com `withTenant` (as tabelas têm RLS por empresa).
3. Órfão = não referenciado ∧ **mais de 24 h** (o multer grava o anexo antes de a
   mensagem existir; os mais novos contam em `recentesIgnorados`).
4. Com `apagar`: **trava** — se o conjunto de referenciados veio vazio, 400 e não apaga
   nada (uma leitura vazia sem erro, como RLS sem contexto, faria tudo parecer órfão).
   Apaga um a um, contando `apagados`/`falhas`, e loga em `warn`.
5. Devolve contagens, bytes e uma **amostra de 20 nomes** para a tela conferir.

### 5. 3.5 Achados

- ✅ **Corrigido em 5f8d319** (trava por empresa). Achado original:
  🟡 **A trava só pega o vazio total.** Se a leitura de **uma** empresa voltar vazia sem
  erro (o mesmo cenário de RLS que a trava cita) e as outras não, os arquivos daquela
  empresa passam por órfãos e são apagados. Não há conferência por empresa (por exemplo,
  "a empresa tem mensagens com arquivo, mas nenhuma foi lida").
- 🟡 **Falha de exclusão é engolida** (`catch {}` sem log do motivo): a tela vê só o
  número de `falhas`.
- 🟡 **A migração lê o arquivo inteiro na memória** (`readFile`), diferente do
  `gravarArquivo`, que faz stream. Com vídeos grandes, 200 por rodada pesam na memória
  da API.
- 🟡 **Falhas persistentes travam a migração.** A rodada pega sempre os primeiros 200 do
  disco; os que falham continuam no começo da lista. Com 200 falhas seguidas a rodada
  não copia nada e o restante nunca é tentado.
- 🟡 **Arquivo migrado parece novo.** No S3, `modificadoEm` = `LastModified` = momento da
  cópia; logo depois de uma migração, a varredura conta órfãos antigos como recentes e
  os ignora por 24 h (seguro, mas confunde a leitura).
- 🟡 **Mensagem de erro com o bucket errado.** O controller chama `explicarErroS3(erro)`
  sem o bucket, que cai no padrão `"plataforma"`: com outro `S3_BUCKET`, o texto aponta
  o bucket errado. A `situacao` passa o bucket certo.
- 🟡 **S3 meio configurado cai em disco em silêncio.** Faltando uma das quatro
  variáveis, `s3Configurado=false` e nada avisa no boot; só a tela de situação mostra.
- 🟡 **Cada acesso a arquivo no S3 faz um `HeadObject`** antes do redirecionamento: uma
  ida extra ao MinIO por imagem servida.
- 🟡 **A leitura dos referenciados carrega todas as URLs** de mensagens com arquivo de
  todas as empresas num `Set` em memória.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`whatsapp/midia-arquivos`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads/uploads.config`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@aws-sdk/client-s3`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@aws-sdk/s3-request-presigner`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`MinIO (externo)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/armazenamento` | 🟢 |
| **Constante Parametrizada `ARMAZENAMENTO_S3_PASTAS`:** pastas (1º segmento) que vão para o S3, separadas por vírgula | `apps/api/src/modules/armazenamento` | 🟢 |
| **Constante Parametrizada `S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY`:** as quatro são obrigatórias para haver S3 | `apps/api/src/modules/armazenamento` | 🟢 |
| **Constante Parametrizada `S3_ENDPOINT_PUBLICO`:** host do link assinado | `apps/api/src/modules/armazenamento` | 🟢 |
| **Constante Parametrizada `VALIDADE_LINK_SEGUNDOS`:** link temporário | `apps/api/src/modules/armazenamento` | 🟢 |
| **Constante Parametrizada `AMOSTRA`:** nomes devolvidos | `apps/api/src/modules/armazenamento` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

