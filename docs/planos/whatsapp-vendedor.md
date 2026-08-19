# WhatsApp do vendedor — atendimento com as ferramentas da plataforma

> Plano de implementação registrado em 2026-08-14. Ainda não implementado — serve
> como referência para quando a implementação começar.
>
> **Atualizado em 2026-08-14** após análise aprofundada do Zapo (issues, cadência de
> commits, contribuidores, README). **Biblioteca escolhida: Zapo.** Duas decisões
> técnicas mudaram por causa dessa análise — estado de sessão em **Postgres** (não
> Redis) e **Redis sai do escopo da Fatia 1**. Ver "Sobre o Zapo" e Fase 1.

## Contexto

O vendedor já atende o cliente pelo WhatsApp, mas fora do sistema: para mandar um
orçamento ele sai do WhatsApp, entra na plataforma, gera o PDF, volta e anexa. O
histórico da conversa não existe para a empresa — some com o aparelho do vendedor —
e o supervisor não tem como acompanhar o atendimento.

A proposta é trazer esse atendimento para dentro do módulo Comercial: o vendedor
conecta o WhatsApp, conversa com o cliente na nossa tela, com as ações da plataforma
à mão (agendar visita, montar orçamento, consultar NF-e, reenviar boleto, ver posição
do cliente), o contato fica ligado ao cadastro do cliente, e a conversa é gravada com
leitura para supervisor e gerente.

---

## Decisão que precisa ser tomada antes de escrever código

**O requisito "o vendedor conecta o WhatsApp dele" só é atendível por biblioteca não
oficial, e isso significa risco real de banimento do número do vendedor.**

Não é uma formalidade jurídica distante. Os números:

- Bibliotecas que fazem engenharia reversa do WhatsApp Web (Baileys, WAHA, Evolution
  API — e o **Zapo**) violam os Termos de Uso; o Meta detecta por volume, padrão de
  mensagens, fingerprint de dispositivo e sessões não vinculadas à API oficial.
- Levantamento com mais de 600 PMEs indianas: **68% relataram ao menos um banimento
  em 12 meses** usando automação não oficial; ferramentas desse tipo costumam durar
  **2 a 8 semanas** antes da detecção.
- O caminho oficial é a **Cloud API** do Meta (a API On-Premises foi descontinuada em
  23/10/2025). Ela é estável e suportada — mas **não conecta o WhatsApp pessoal de
  ninguém**: exige número dedicado numa conta WhatsApp Business (WABA), e o número
  migrado **deixa de funcionar no aplicativo comum**. Fora da janela de 24 h só se
  fala com o cliente por *template* pago e pré-aprovado.

Ou seja, os dois caminhos são mutuamente exclusivos no ponto que mais importa para
este pedido:

| | Não oficial (Zapo/Baileys) | Cloud API (oficial) |
|---|---|---|
| Vendedor usa o próprio número | **Sim** | Não — número dedicado da empresa |
| Vendedor continua usando o app no celular | Sim | **Não** — o número sai do app |
| Falar com quem não escreveu antes | Livre | Só *template* aprovado e pago |
| Risco de banimento | **Alto** (o número do vendedor) | Nenhum |
| Custo por mensagem | Zero | Por conversa/template |
| Suporte do Meta | Nenhum | Sim |

**Recomendação:** desenhar a feature com o **transporte trocável** desde o primeiro
commit (ver Fase 2) e começar por um **piloto controlado** com o Zapo em 2–3
vendedores voluntários, usando **chip dedicado, não o número pessoal**. Se o piloto
sobreviver alguns meses, amplia; se vier banimento, a troca para a Cloud API custa
uma implementação de interface, não uma reescrita.

Colocar o número pessoal de 69 vendedores nisso é o cenário que eu não recomendaria:
o número que some é a agenda de clientes deles.

### Sobre o Zapo — análise de 2026-08-14

Biblioteca escolhida (`github.com/vinikjkkj/zapo`). Duas leituras foram feitas: uma
superficial (página do repositório) e uma segunda, mais funda, sobre issues, cadência
de commits e contribuidores. **A segunda corrigiu conclusões da primeira** — ficam as
duas registradas para quem revisar a decisão depois.

**O que é.** Implementação própria do protocolo WhatsApp Web em TypeScript, **sem
depender de Baileys ou whatsapp-web.js**. MIT. Estável desde a **v1.0.0**, seguindo
SemVer declarado. Requer **Node >= 20.9.0** — nossos containers são todos
`node:20-alpine`, compatível sem mexer em nada.

A API é pequena, o que é bom sinal para a camada de transporte da Fase 2:

```ts
const client = new WaClient({ store, sessionId: 'default' }, new ConsoleLogger('info'))
client.on('auth_qr',    ({ qr }) => …)          // QR para a tela do vendedor
client.on('auth_paired',({ credentials }) => …) // credencial a persistir cifrada
client.on('message',    async (event) => …)     // recebimento
await client.message.send(jid, 'pong')
await client.connect()
```

`sessionId` é parâmetro de construtor: **multi-sessão é uma instância por vendedor**,
sem gambiarra. O store é plugável por backend — incluindo **Postgres**, o que permite
guardar o estado Signal no banco que já temos (ver Fase 1).

**Manutenção — a primeira leitura estava errada.** Não é projeto de mantenedor único:
são **4 contribuidores** ativos (`vini`/`vinikjkkj`, `digaovaa`, `jlucaso1`), com
commits nos últimos dias. A atividade é **contínua desde a criação** (março/2026),
com pico de 47 commits numa semana e as últimas cinco em 15, 10, 13 e 9 — as "semanas
sem atividade" que aparecem na estatística do GitHub são apenas as semanas em que o
repositório ainda não existia. Dos ~19 issues mais recentes, **17 fechados**, a
maioria em um ou dois dias; só dois abertos (um pedido de feature e um bug de `ws` no
Node v26.7.0, que não nos afeta).

**O achado que mais importa.** Nos dez dias anteriores à análise foram corrigidos
**sete bugs de protocolo**: pareamento e payload Noise desalinhados com o WhatsApp
Web, dispositivos hospedados não reconhecidos como próprios, votos de enquete
indecifráveis entre os formatos PN e LID, versão errada de protocolo em enquetes,
`native_flow` incorreto para PIX, newsletter devolvendo 400.

Isso não indica instabilidade do projeto — indica **a natureza da categoria**: o
WhatsApp muda o protocolo por baixo, continuamente, e a biblioteca corre atrás. A
qualidade do Zapo está em correr rápido. Mas a consequência operacional é dura e
precisa estar no orçamento da feature:

> **Esta não é uma dependência que se instala e esquece.** Ficar dois meses sem
> atualizar significa quebrar. Alguém precisa acompanhar releases — é **custo
> recorrente**, não custo de implantação.

**O disclaimer.** O README diz apenas: *"This project is an independent implementation
for engineering and interoperability research. It is not affiliated with or endorsed
by WhatsApp."* — a formulação que dá cobertura ao autor. **Não há uma palavra sobre
risco de banimento**: o projeto não assume, e não poderia assumir, o risco que recai
sobre o número do vendedor. Isso reforça a recomendação de chip dedicado acima.

**Ponto de atenção de infraestrutura.** O issue #235 relatou **9 GB de RAM** com o
store em Redis, onde se esperavam 500 MB. Foi corrigido, mas é justamente o backend
que a versão anterior deste plano pretendia introduzir — motivo direto da mudança
para Postgres na Fase 1.

O risco continua somado, não alternativo: além do banimento (que vale para qualquer
biblioteca não oficial), há o risco de o projeto parar. A camada de transporte da
Fase 2 é o que protege disso — trocar Zapo por Baileys deve custar um arquivo.

---

## Fase 1 — Infraestrutura: um serviço à parte

A restrição técnica que mais molda este plano: **cada sessão de WhatsApp é uma
conexão WebSocket viva e com estado.** Isso não cabe no container da API como ele é
hoje.

- A API sobe e desce a cada deploy; uma sessão derrubada exige novo pareamento por QR
  se o estado não for persistido corretamente.
- Escalar a API horizontalmente duplicaria conexões da mesma sessão — o WhatsApp
  desconecta a anterior.
- 69 vendedores = 69 conexões persistentes + mídia + criptografia no mesmo processo
  que atende as requisições HTTP do sistema inteiro.

Então: **`apps/whatsapp-worker`**, serviço Node próprio na mesma stack.

- **Uma réplica só** (as sessões são *stateful*; não dá para balancear entre réplicas
  sem sharding por sessão — fica registrado como limite conhecido).
- **Sem Redis** (decisão revista em 2026-08-14). A versão anterior deste plano previa
  fila/pub-sub no Redis e o store de sessão nele. Dois motivos derrubaram isso: o
  Zapo oferece **store em Postgres**, e o issue #235 mostrou consumo de memória
  patológico justamente no backend Redis. Como o `stack.rcgcba.prod.yml` **não tem
  Redis nenhum** hoje (o `docker-compose.dev.yml` sobe um, mas nenhum código usa),
  evitar Redis **remove um componente inteiro de infraestrutura da Fatia 1** — menos
  coisa nova em produção, menos coisa para operar.
  - Estado de sessão: **store Postgres do Zapo**, no banco que já existe.
  - Eventos worker ↔ API: **`LISTEN`/`NOTIFY` do Postgres** para o que é assíncrono
    (mensagem recebida, sessão caiu) e **HTTP direto** para o que é comando com
    resposta (enviar mensagem, parear, desconectar). Com **uma réplica** do worker,
    isso basta — fila durável só passa a ser necessária se houver sharding.
- **A cifra precisa de desenho próprio.** A credencial de sessão dá acesso ao WhatsApp
  do vendedor — é segredo de verdade, e o requisito de guardá-la cifrada
  (AES-256-GCM, mesma `AGENTE_IA_CRYPTO_KEY` ou chave irmã) **continua valendo**. Mas
  o store do Zapo grava no formato dele, em tabelas dele, sem cifra nossa e sem
  `empresaId`/RLS. Duas saídas, a decidir na implementação:
  1. **Store customizado** implementando a interface do Zapo por cima do nosso Prisma
     — cifrando na escrita e decifrando na leitura. Mais trabalho, mas mantém a regra
     de RLS e cifra do resto do sistema.
  2. Store Postgres nativo do Zapo num **schema separado**, com `GRANT` restrito, e a
     cifra ficando por conta do isolamento do schema.
  A opção 1 é a coerente com o restante da plataforma; fica registrada como a
  preferida, com o custo reconhecido.
- Reconexão com backoff, e o evento de "sessão caiu" precisa chegar à tela do vendedor
  para ele reparear.

---

## Fase 2 — A interface de transporte (o ponto mais importante do plano)

**`apps/api/src/modules/whatsapp/transport/whatsapp-transport.ts`**

```ts
export interface WhatsappTransport {
  parear(sessaoId: string): AsyncIterable<{ qr: string } | { pareado: true }>;
  desconectar(sessaoId: string): Promise<void>;
  enviarTexto(sessaoId: string, jid: string, texto: string): Promise<{ externoId: string }>;
  enviarArquivo(sessaoId: string, jid: string, arquivo: Buffer, nome: string, mime: string): Promise<{ externoId: string }>;
  aoReceber(handler: (msg: MensagemRecebida) => Promise<void>): void;
}
```

Duas implementações: `ZapoTransport` e `CloudApiTransport`. A escolha vem de um
parâmetro por empresa (`WHATSAPP_TRANSPORTE`), reusando `ParametrosService`.

O mapeamento para a API real do Zapo é quase um para um — foi o que confirmou que
esta interface é adequada e não uma abstração inventada:

| Interface | Zapo |
|---|---|
| `parear(sessaoId)` | `new WaClient({ store, sessionId })` + eventos `auth_qr` / `auth_paired` |
| `enviarTexto(...)` | `client.message.send(jid, texto)` |
| `aoReceber(handler)` | `client.on('message', …)` |
| `desconectar(...)` | encerramento do `WaClient` da sessão |

A assimetria a tratar está no `CloudApiTransport`: lá não existe `parear` por QR (o
número é provisionado na WABA) e o recebimento é **webhook**, não evento de socket.
A interface aguenta os dois, mas a tela de conexão precisa saber que o passo de QR
some — é a única parte do front que não é agnóstica ao transporte.

Todo o resto do sistema fala **só com essa interface**. É o que transforma "trocar de
biblioteca" ou "migrar para a API oficial" num trabalho de dias em vez de meses — e,
dado o histórico dessas bibliotecas, essa troca é questão de quando, não de se.

---

## Fase 3 — Modelo de dados

Migration única, com o bloco RLS padrão em todas as tabelas com `empresaId`
(ver [`migrations/README.md`](../../apps/api/prisma/migrations/README.md)).

- **`WhatsappSessao`** — `empresaId`, `vendedorId` (`@unique` por empresa),
  `numero`, `status` (`desconectada` | `pareando` | `conectada` | `banida`),
  `credencialCifrada`, `ultimaConexao`, `transporte`.
- **`WhatsappContato`** — `empresaId`, `jid` (identificador do WhatsApp),
  `nomeExibicao`, `telefoneNormalizado`, `clienteId?`, `vinculadoPor`,
  `ignorado Boolean` (ver privacidade, Fase 6). `@@unique([empresaId, jid])`.
- **`WhatsappConversa`** — `empresaId`, `sessaoId`, `contatoId`, `clienteId?`,
  `ultimaMensagemEm`, `naoLidas`, `arquivada`.
- **`WhatsappMensagem`** — `empresaId`, `conversaId`, `externoId` (id do WhatsApp,
  `@unique` — é o que torna o recebimento idempotente em reconexão), `direcao`
  (`entrada` | `saida`), `tipo` (`texto` | `imagem` | `documento` | `audio` …),
  `conteudo @db.Text`, `arquivoUrl`, `enviadaPor` (usuário, quando saída),
  `statusEntrega`, `respondeuA`, `criadaEm`.
- **`WhatsappAcaoRegistro`** — o que foi disparado da conversa (orçamento gerado,
  visita agendada, boleto reenviado), ligando `conversaId` ao `orcamentoId` /
  `atividadeId` / `tituloReceberId`. É o que dá para medir se a ferramenta vende.

Índices que importam: `(empresaId, conversaId, criadaEm)` para o rolo da conversa e
`(empresaId, clienteId)` para "todas as conversas deste cliente".

**Mídia** não vai para o banco: mesmo destino dos uploads atuais
(`apps/api/uploads/`, servido em `/uploads`), com nome opaco. Áudio e imagem de
conversa crescem rápido — a retenção da Fase 6 vale para os arquivos também.

---

## Fase 4 — Vínculo com o cadastro de cliente

O que dá sentido à feature: a conversa deixa de ser um contato solto e vira
atendimento a um cliente conhecido.

1. **Casamento automático** por telefone normalizado (só dígitos, com e sem o 9º
   dígito, com e sem DDI 55) contra `clientes.telefone`, `.telefone2` e `.celular`,
   **restrito à carteira do vendedor** (`resolverEscopoVendedores`).
2. **Ambiguidade não adivinha**: dois clientes com o mesmo telefone → a conversa fica
   sem vínculo e a tela pede para escolher.
3. **Vínculo manual** por combobox de cliente (reusa `cliente-combobox`), gravando
   `vinculadoPor`.
4. Vinculado o contato, o painel lateral da conversa mostra a **posição do cliente**
   (última compra, títulos vencidos, mix) — dado que já existe em
   `ClientesService.posicao`.

---

## Fase 5 — Ferramentas dentro da conversa

Aqui o reuso é grande: é o **mesmo catálogo de ferramentas do agente Grok**
(`agente-tools.service.ts`), com a mesma trava dupla de permissão — o que o vendedor
não pode fazer no sistema, não aparece no botão da conversa.

| Ação na conversa | Reusa | Permissão |
|---|---|---|
| Agendar visita/retorno | `AtividadesService.create` | `atividades.cadastrar` |
| Montar e enviar orçamento (PDF) | `OrcamentosService.create` + `orcamento-pdf.ts` | `orcamentos.cadastrar` |
| Consultar NF-e do cliente | `NotasSaidaService` | `notas-saida.visualizar` |
| Reenviar boleto / 2ª via | `TitulosReceberService` | `titulos-receber.visualizar` |
| Ver posição do cliente | `ClientesService.posicao` | `posicao-cliente.visualizar` |
| Sugestão de compra | `SugestaoCompraService` | `sugestao-compra.visualizar` |

**O PDF do orçamento era gerado no navegador** (`apps/web/src/lib/orcamento-pdf.ts`,
jsPDF). Para anexar no WhatsApp o arquivo precisa existir no servidor — ou o front
envia o PDF gerado como upload, ou a geração migra para o backend. A segunda é mais
correta e é trabalho próprio, que precisa entrar na conta. **Feito em 2026-08-17**
(ver o estado dessa data): o gerador virou
`apps/api/src/modules/orcamentos/orcamento-pdf.ts`, a tela passou a baixar de
`GET /orcamentos/:id/pdf`, e o arquivo do navegador foi removido.

**Boleto/NF-e:** hoje a plataforma **não emite** nem guarda o PDF de nenhum dos dois —
`TituloReceber` tem os dados do título, não o boleto renderizado, e `NotaSaida` tem a
chave da NF-e, não o DANFE. Enviar "o boleto" exige integração com o banco/ERP que
**não existe ainda**. Registrado como dependência externa, fora deste plano: na v1, a
ação manda os *dados* (linha digitável, vencimento, valor; número e chave da NF-e),
não o arquivo.

---

## Fase 6 — Privacidade, retenção e acesso do supervisor

O ponto mais delicado, e o que mais gera problema se for pensado depois.

**Só grava conversa de contato ligado a cliente.** Se o vendedor parear um número que
também usa na vida pessoal, o sistema estaria gravando conversa com a família dele. A
regra: mensagem de contato **sem `clienteId`** não é persistida — fica só um registro
mínimo de "há uma conversa não vinculada", e o vendedor decide vincular (passa a
gravar dali em diante) ou marcar `ignorado`. **Gravação retroativa nunca acontece.**

**O vendedor precisa saber, por escrito, que a conversa com clientes é gravada e
visível ao supervisor.** Um aceite registrado na primeira conexão (data, versão do
texto) — não é burocracia, é o que separa a ferramenta de um grampo.

**Acesso à leitura**, reusando o escopo hierárquico que já existe:

- vendedor: as próprias conversas;
- supervisor/gerente: as da equipe (`resolverEscopoVendedores`);
- rotina RBAC nova `whatsapp-conversas` com `visualizar` (as suas) e uma ação
  separada para ler as dos outros — a segunda deve ser concedida conscientemente.
- Toda leitura de conversa alheia é registrada (mesma ideia do `acessos_log`).

**Retenção** por parâmetro (`WHATSAPP_RETENCAO_DIAS`), com expurgo de mensagens e
mídia. Sem isso a base cresce sem limite e o passivo de dado pessoal cresce junto.

**LGPD:** são dados pessoais de terceiros (os clientes) numa base da empresa. Vale
definir antes: finalidade declarada, prazo, e como responder a um pedido de exclusão.

---

## Fase 7 — Frontend

**`/comercial/whatsapp`**, layout de três colunas (o formato que todo mundo já sabe
usar):

- **Esquerda** — lista de conversas: foto/nome, prévia, não lidas, badge do cliente
  vinculado, busca.
- **Centro** — o rolo de mensagens, com envio de texto, anexo e áudio; barra de ações
  com as ferramentas da Fase 5.
- **Direita** — o cliente: dados, posição, últimos orçamentos, títulos vencidos,
  sugestão de compra.

**Tempo real:** WebSocket/SSE da API para o navegador. O `api-client.ts` atual só faz
`fetch` — é uma capacidade nova, com o cuidado de reautenticar no refresh de token
(a sessão expira em 15 min e a trava de expediente vale aqui também).

**`/comercial/whatsapp/conexao`** — parear: QR na tela com renovação automática,
status da sessão, botão desconectar. E **`/comercial/whatsapp/equipe`** para
supervisor/gerente, com o filtro de vendedor.

---

## Fase 8 — Verificação

1. Parear uma sessão, derrubar o worker, subir de novo: a sessão volta **sem** novo QR.
2. Mensagem recebida duas vezes (reconexão) grava **uma** linha — a unicidade de
   `externoId` segurando.
3. Contato cujo telefone bate com um cliente da carteira vincula sozinho; telefone
   ambíguo **não** vincula e pede escolha.
4. Contato sem cliente vinculado **não tem mensagem persistida** — conferir no banco.
5. Vendedor sem `orcamentos.cadastrar` não vê o botão de orçamento na conversa, e a
   rota recusa se for chamada direto.
6. Supervisor lê a conversa de um subordinado; vendedor de outra equipe recebe 404.
7. Expurgo por retenção apaga mensagens **e** arquivos de mídia.
8. Fora do expediente, o acesso à tela cai no mesmo 403 `FORA_HORARIO`.
9. Trocar `WHATSAPP_TRANSPORTE` de `zapo` para `cloud-api` não exige mudança fora da
   camada de transporte.
10. Credencial de sessão gravada no banco está **cifrada** — conferir lendo a tabela
    direto, como se faz com `agente_credenciais`.

### Rotina de manutenção (não é verificação de entrega, é de operação)

Pela cadência de correções de protocolo do Zapo (ver análise acima), a feature só
segue funcionando se alguém **acompanhar os releases da biblioteca** e atualizar com
regularidade. Definir o responsável e a periodicidade **antes** do piloto ir ao ar —
descobrir isso depois do primeiro atendimento quebrado é caro.

---

## Ordem sugerida e tamanho

Esta é a maior das entregas discutidas até aqui — bem maior que os blocos do agente.
Sugestão de fatiamento, cada fatia com valor próprio:

1. **Fatia 1 — Conectar e conversar.** Worker, transporte, sessão, pareamento por QR,
   receber/enviar texto, vínculo com cliente, tela de três colunas. É o piloto.
2. **Fatia 2 — Ferramentas.** Agendamento, orçamento (com o PDF migrado para o
   servidor), posição do cliente, dados de NF-e e título.
3. **Fatia 3 — Governança.** Acesso do supervisor, registro de leitura, retenção,
   aceite do vendedor, tela da equipe.
4. **Fatia 4 — Mídia e o resto.** Imagem, documento, áudio; indicadores de entrega.

A Fatia 3 não é opcional nem "depois se der": se a Fatia 1 for para produção sem ela,
já haverá conversa de cliente gravada sem regra de acesso nem de descarte.

---

## Estado em 2026-08-17 (terceira sessão) — orçamento pela conversa

Entregue o maior item que faltava da Fatia 2: **a proposta comercial em PDF sai
pela conversa**. Nada de boleto/DANFE mudou (continuam fora, sem integração).

### O que passou a funcionar

- **O PDF é montado no servidor.** `apps/api/src/modules/orcamentos/orcamento-pdf.ts`
  é o porte de `apps/web/src/lib/orcamento-pdf.ts` (removido). Mesmo layout,
  mesmas regras de formatação — o arquivo do navegador deixou de existir para
  não haver duas propostas possíveis.
- **`GET /orcamentos/:id/pdf`** devolve o arquivo e registra a emissão no
  histórico do orçamento/cliente. `POST :id/registrar-pdf` foi removida: existia
  só porque o arquivo nascia no navegador e o servidor precisava ser avisado.
- **A tela de orçamento baixa dessa rota** (`apiDownload` no `api-client.ts` —
  a rota exige Bearer, então `<a href>` não serve: busca como blob e dispara o
  download).
- **Ação "Enviar orçamento (PDF)" na conversa**, para contato vinculado a
  cliente: `GET /whatsapp/conversas/:id/acoes/orcamentos` lista os 20 mais
  recentes **do cliente da conversa**, e `POST .../acoes/orcamento` gera e
  anexa. Permissão `orcamentos.visualizar`, como as demais ações.
- **O rastro do envio** fica em dois lugares: `whatsapp_acoes` (tabela que
  existia no schema e não era gravada por ninguém) com `acao: 'orcamento'` e o
  `orcamentoId`, e uma atividade nova no histórico — `envio_whatsapp`,
  "Proposta enviada pelo WhatsApp", separada de "PDF gerado".

### Decisões tomadas ao implementar

- **O PDF é gerado no instante do envio**, não guardado. O cliente recebe o
  orçamento como ele está agora; um arquivo arquivado envelheceria em silêncio.
- **A trava de desconto vale igual nos dois caminhos** (409 sem autorização):
  é o `OrcamentosService` que decide, e a conversa só delega — o WhatsApp não
  vira a porta dos fundos para mandar proposta não autorizada.
- **Orçamento de outro cliente é recusado (400)**, mesmo estando na carteira do
  vendedor: sem essa conferência, um id válido mandaria a proposta certa para a
  pessoa errada.
- **Sem canvas no servidor**, o logo só entra em PNG/JPEG. O upload de logo
  aceita WEBP e SVG, que a versão do navegador rasterizava num `<canvas>`; aqui
  esses formatos saem sem imagem. Se virar problema, a saída é converter no
  upload — não no gerador.
- **`enviarConteudo`** é a variante de `enviarArquivo` para conteúdo que a
  plataforma produz: grava em `WHATSAPP_DIR` só **depois** da confirmação do
  provedor, mesma regra que já valia para não exibir anexo que o cliente nunca
  recebeu.

### O que foi verificado, e o que não foi

Verificado em dev: PDF gerado pela rota (7,9 kB, `%PDF-1.3`, cabeçalho/cliente/
condições/itens/total/rodapé conferidos no conteúdo, acentuação correta), logo
PNG embutido (XObject de imagem no arquivo), emissão registrada no histórico, e
as duas rotas novas recusando com 400 em conversa sem cliente vinculado.

**Não verificado: o envio real pela conversa.** Exige sessão pareada e mandaria
mensagem para um cliente de verdade — precisa ser feito por quem tem o aparelho.
O que falta confirmar nesse teste: o anexo chegando como documento no celular do
cliente e a mensagem aparecendo no rolo com o link do arquivo.

### Dois problemas de operação encontrados no mesmo dia (corrigidos)

Vieram juntos no relato "o envio não funciona e não temos as opções", mas são
independentes um do outro e nenhum tem relação com o orçamento.

**1. `status@broadcast` virava conversa, e envio para ela sempre falha.** O
filtro que descarta feed de status e canais existia **só no recebimento**
(`zapo.transport.ts`, evento `message`); a **agenda e a lista de conversas do
aparelho** filtravam apenas grupos (`@g.us`). O feed de status aparecia como um
contato normal — "Ricardo" —, o vendedor abria conversa por ali, e o envio
morria no provedor com `direct fanout missing signal sessions for all targets`,
depois de 20 s de timeout buscando chaves Signal de um destinatário que não
existe. Corrigido em três camadas, porque esconder da lista não é recusar:

- as consultas de agenda/conversas do worker excluem `@broadcast`,
  `@newsletter` e `@g.us`;
- `iniciarConversa` recusa jid que não seja de pessoa (`jidDePessoa`);
- a listagem de conversas esconde as que já foram criadas assim — o registro
  antigo continua no banco e não some sozinho.

**2. A tela ficava sem lista, sem composer e sem ações** — é o estado "Seu
WhatsApp não está conectado", que substitui a tela inteira. A causa foi o socket
do WhatsApp caindo repetidamente (`code 1006`) ao longo do dia, com a
reconexão falhando por alguns segundos a cada vez; enquanto isso o worker avisa
a API e a sessão vai a `desconectada`. No fim ficou **zumbi**: socket aberto,
mas nenhuma query respondida (daí os timeouts de 20 s). **Restart do worker
resolve** — ele restaura a sessão do banco, sem QR. Vale suspeitar da rede do
host (máquina que hiberna derruba o socket de dentro do container).

Registrado porque nenhum dos dois aparece em build ou em teste: só executando.

**3. Não havia como vincular um contato a um cliente pela tela.** Descoberto ao
investigar "mandei mensagem e não chegou no sistema": a mensagem **chegava**
(`naoLidas` incrementava, `ultimaMensagemEm` atualizava), mas o conteúdo não era
gravado — regra da Fase 6, contato sem `clienteId` não tem conversa persistida.
O problema é que a rota de vínculo (`PUT /whatsapp/conversas/:id/vinculo`)
**existia desde o início e nenhuma tela a chamava**: só dava para vincular ao
*iniciar* a conversa escolhendo um cliente, e conversa que chegou pelo aparelho
ficava sem saída — nunca gravava, nunca mostrava as ações do sistema. O painel
direito da conversa agora traz o combobox de cliente e o botão de vincular,
avisando que a gravação vale só dali em diante.

Vale como lição de revisão: uma rota sem chamador no front não aparece em
nenhum teste de tipo nem de build, e some do radar até alguém tentar usar o
recurso pela tela.

### Reações com emoji (2026-08-17)

Pedido do usuário: reagir às mensagens como no WhatsApp. Entregue ponta a ponta.

- **Tabela `whatsapp_reacoes`** (migration `20260818013003`, com RLS): reação é
  substituição, não acumulação — unicidade por `(empresaId, mensagemId, deQuem)`,
  e `deQuem` só tem `nos`/`contato` porque o atendimento é 1:1. Fica em tabela
  própria, não numa coluna da mensagem, porque reação chega e sai **depois** da
  mensagem existir; gravar por cima do registro dela faria a atualização
  competir com o recebimento.
- **Emoji vazio remove** — a convenção do próprio WhatsApp, mantida do provedor
  até a rota da tela, para não existir uma segunda rota só para desfazer.
- **Barra de emojis na bolha** (os seis do WhatsApp), com a reação aparecendo
  meio fora da bolha. Seletor completo de emoji ficou de fora.
- **Só o dono da sessão reage**: supervisor lê a conversa, mas não fala pelo
  aparelho de quem supervisiona — nem com emoji.

**Bug corrigido de tabela:** reação recebida caía no `outro` do `interpretar` e
era gravada como **mensagem vazia** no histórico — uma bolha em branco no rolo
do vendedor a cada emoji que o cliente mandasse. Agora é desviada antes, em
`reacaoDe`.

#### Armadilha: a reação recebida chega pelo evento `message`, não por `message_addon`

O sentido app → WhatsApp funcionou de primeira; o inverso levou várias rodadas.
**Verificado executando, com log:** a reação do contato chega no evento
`message` comum, com `reactionMessage` **já decifrado** — no log,
`campos=messageContextInfo,reactionMessage`. O evento `message_addon`, que a
documentação da biblioteca descreve para addons (reação, voto de enquete,
edição), **não dispara** neste caminho.

O erro que custou as idas e vindas foi meu: a primeira versão lia
`reactionMessage` dentro do `message` — o caminho certo —, e eu a **troquei**
por um descarte, confiando no `message_addon` que a documentação indicava, sem
antes provar que o evento novo recebia alguma coisa. Como o descarte era mudo,
o sintoma virou "a reação simplesmente não chega": sem erro, sem bolha vazia,
sem registro. Hoje os dois caminhos estão ligados (a gravação é idempotente por
`(mensagem, lado)`, então receber pelos dois não duplica) e **cada desfecho
tem log**: recebida, ilegível, ou ignorada pela API.

Sobre o segredo das mensagens: `addons: { persistAllSecrets: true }` com
`cacheProviders: { messageSecret: 'pg' }` continua valendo e está ativo. Guarda
o segredo de 32 bytes de cada mensagem **sem** guardar o conteúdo — o que
preserva a regra de `messages: 'none'` — e é o que permite abrir um addon que
venha cifrado. O padrão da biblioteca é memória, que perderia tudo a cada
restart do worker.

`WHATSAPP_LOG_NIVEL=debug` (env do worker) sobe o log da biblioteca para o
nível em que ela registra falha de decifrar addon. Em `info` isso some — e foi
o que manteve o problema invisível. Ruidoso: só ao investigar.

### Tela de atendimento e agendamento (2026-08-18)

Rodada de ajustes pedidos usando a tela de verdade:

- **Laterais recolhíveis**, com a preferência lembrada. Numa tela de 14" três
  colunas fixas deixam o rolo estreito demais.
- **Altura amarrada à viewport, rolagem por coluna.** O que faltava era
  `min-h-0`: em flex, o filho não encolhe abaixo do próprio conteúdo, então o
  rolo empurrava a página inteira. O auto-scroll passou a `block: "nearest"`,
  senão o navegador ajustava os ancestrais e a página se mexia a cada mensagem.
- **Painéis encaixados na coluna da direita** (dados do contato, posição do
  cliente, novo orçamento), alternando no mesmo espaço e empurrando a conversa
  em vez de cobri-la — o comportamento do "Dados do contato" do WhatsApp. O
  orçamento é o **`OrcamentoFormContent` da tela de Orçamentos**, não um
  formulário próprio: um segundo jeito de orçar teria outras regras de preço.
- **Sinais do cliente na lista de conversas:** dias desde a última compra
  (positivação) e um cifrão colorido pela cobrança — vermelho vencido, azul
  vencendo em 7 dias, verde em dia. Duas consultas **agregadas por página**, não
  uma por conversa: a lista atualiza a cada 15 s, e o N+1 seriam 60 idas ao
  banco por atualização. Cada indicador respeita a permissão da rotina dona do
  dado; sem ela, vem nulo.
- **Aviso de contato atendido por outro vendedor.** A consulta atravessa as
  sessões alheias de propósito, mas devolve **só o nome de quem atende** — a
  conversa do outro continua invisível para quem não tem escopo.
- **Mensagens agendadas** (`whatsapp_mensagens_agendadas`, migration
  `20260818032908`, com RLS). Rotina a cada minuto na API. Dois cuidados que
  moldaram o desenho:
  - **Idempotência entre réplicas:** só envia quem conseguir mudar `pendente`
    → `enviando` na atualização condicional. Sem isso, cada réplica da API
    mandaria a mesma mensagem.
  - **A varredura percorre empresa por empresa** porque as tabelas têm RLS —
    sem `withTenant` a consulta volta vazia. `empresas` não tem RLS, e é por
    ela que a rotina começa.
  - Falha (WhatsApp desconectado na hora) vira `erro` visível na conversa, com
    o motivo. Agendamento que some em silêncio é pior do que um que não saiu.
  - Só texto: anexo agendado exigiria segurar o arquivo até a hora do envio.

~~**Ainda em aberto (decisão pendente):**~~ **resolvido em 2026-08-18** — ver
"Mensagem enviada pelo celular do vendedor", abaixo.

### Feed do sino, com tabela de notificação (2026-08-18)

O sino da topbar mostrava texto fixo desde o começo. Agora é `GET
/notificacoes` (`apps/api/src/modules/notificacoes/`), consumido por
`apps/web/src/components/layout/notificacoes-sino.tsx`.

A primeira versão **derivava** o feed do dado vivo (conversa com `naoLidas > 0`,
atividade vencida). Foi substituída por uma **tabela**, `notificacoes`
(migration `20260818145615`, com RLS), que é a **fonte única** do sino. O que a
troca comprou:

- **"Lido" de verdade**, por notificação, com "marcar todas". No modelo
  derivado não havia onde guardar isso sem duplicar estado.
- **Eventos que não têm dado vivo para consultar** — orçamento aprovado ou
  recusado, cliente que entrou na carteira. Não existe "consulta de coisas que
  aconteceram"; ou alguém registra na hora, ou o fato se perde.
- **Uma consulta no lugar de uma varredura por origem** a cada passagem do
  sino, para cada usuário logado.

**Quem grava é quem provoca o fato**, dentro da própria transação
(`registrarNotificacao`, no formato de `registrarAtividadeOrcamento` — função,
não service, para o produtor não injetar mais uma dependência):

| Evento | Onde é gravado |
| --- | --- |
| Mensagem recebida | `WhatsappConversasService.registrarMensagemRecebida` |
| Agendamento que falhou | `WhatsappAgendamentoService.enviarUma` (catch) |
| Orçamento aprovado/recusado | `registrarAtividadeOrcamento` (funil dos dois caminhos) |
| Cliente que mudou de carteira | `ClienteAlteracoesService.aplicarNoCliente` |
| Atividade vencida, título vencido | `NotificacoesVarreduraService` (30 min) |

Decisões que moldaram o desenho:

- **Vencimento não é evento.** Ninguém "faz" um prazo estourar, então essas
  duas origens precisam de varredura — é a única parte que pergunta ao banco
  em vez de ser avisada. Roda a cada 30 min, e não uma vez ao dia: prazo que
  vence às 8h precisa aparecer de manhã.
- **A varredura pula quem já foi avisado, lido ou não** — e as duas metades
  disso custaram um bug cada, encontrados testando:
  - Contando só os **pendentes**, "marcar todas como lidas" durava meia hora:
    o título continua vencido, e a passagem seguinte ressuscitava tudo. Prazo
    vencido avisa **uma vez**; insistir é trabalho do relatório de cobrança.
  - Sem excluir os já avisados, a janela de `LOTE` **nunca anda**: a consulta
    traz sempre os mesmos vencidos mais antigos e o que está atrás jamais
    notifica. Pela mesma razão o filtro "vendedor tem login" está na consulta,
    e não num `continue` no laço — a primeira versão enchia a janela de
    vendedores sem usuário e não gravava nada.
- **Deduplicação por índice parcial único** (`lidaEm IS NULL AND referenciaId
  IS NOT NULL`): a segunda mensagem da mesma conversa soma no contador da
  linha pendente em vez de empilhar uma linha por mensagem; depois de lida, a
  linha sai do índice e um fato novo pode criar outra. Sem o `WHERE`, a
  conversa notificaria uma vez na vida.
- **`INSERT ... ON CONFLICT`, não "procura e então grava".** Duas mensagens
  chegando juntas passariam as duas pela busca, e a segunda esbarraria no
  índice único — dentro de uma transação esse erro não se recupera e
  **derrubaria a gravação da mensagem junto**. Por isso o registro é SQL bruto
  (o `upsert` do Prisma exige um unique que ele conheça, e o parcial não é).
- **Reenvio da reconexão não conta.** O provedor reentrega o que já mandou; o
  aviso confere se a mensagem já estava gravada antes de somar no contador.
- **Quem faz não é avisado do que fez** (`autorUsuarioId`): o aviso de
  orçamento respondido existe para quando **outra pessoa** — supervisor,
  integração do ERP — mexe no orçamento de um vendedor.
- **Sem prévia do texto da mensagem.** O sino aparece em toda tela do sistema;
  a conversa com o cliente não precisa ficar legível por cima do ombro de quem
  passa. E contato **sem vínculo com cliente** notifica assim mesmo: o fato de
  ele ter escrito não é conteúdo, e é o que leva o vendedor a abrir e vincular.
- **O texto "N mensagens novas" é montado na tela**, a partir do contador —
  gravado, ele envelheceria na mensagem seguinte.
- **A rota não exige permissão**: a notificação foi endereçada a um usuário na
  origem, onde o escopo era conhecido. Filtrar de novo na leitura esconderia o
  que já foi decidido, e mal — a permissão pode ter mudado depois do fato.
- **Coerência é o preço da fonte única:** marcar a conversa como lida marca as
  notificações dela (`marcarNotificacoesDaOrigem`), e a varredura fecha as de
  atividade concluída e título baixado. Sem isso o sino insiste no que já foi
  resolvido.
- **A conversa aberta passou a morar na URL** (`?conversa=<id>` na tela de
  atendimento), no lugar do `useState`: clicar numa notificação estando **já
  na tela** não remonta o componente, só muda a URL.
- A migration traz um **backfill** das conversas que já estão com mensagem não
  lida — sem ele o badge de quem tem pendência zeraria no deploy.

**Verificado em dev, ponta a ponta:** varredura gravando os 79 títulos
vencidos do vendedor; três mensagens pelo endpoint interno do worker virando
**uma** linha com contador 3, e o reenvio da mesma não somando; marcar a
conversa como lida limpando a notificação dela; cliente que muda de carteira
avisando o novo vendedor e **não** avisando quem fez a troca; orçamento
recusado avisando o vendedor dono; marcar uma, clique repetido (idempotente),
404 em id de outro usuário e "marcar todas". Falta a conferência visual do
sino na tela.

**Não coberto:** leitura feita pelo **celular** do vendedor não chega à
plataforma (o worker não informa), então a notificação continua pendente até
ele abrir a conversa por aqui — a mesma limitação que `naoLidas` já tinha.


### Recibos de entrega e leitura (2026-08-18)

O visto duplo nunca aparecia: `statusEntrega` era gravado no envio como
`enviada` e **nunca mais mudava**. A bolha do componente já sabia desenhar os
três estados; o que faltava era o dado — nada no worker escutava recibo, então
toda mensagem do vendedor ficava com um risco só para sempre.

O evento é o **`receipt`** da `zapo-js` (*"inbound `<receipt>` for an outgoing
message – delivery, read, played"*), irmão do `message` e do `message_addon`.
O caminho novo: worker escuta → `POST /whatsapp/interno/recibo` →
`WhatsappConversasService.receberRecibo`.

- **`messageIds` é uma lista.** Quando o cliente abre a conversa, o WhatsApp
  confirma num recibo só tudo o que estava por ler — daí `updateMany` por
  `externoId`, não um update por mensagem.
- **O status não retrocede.** O `in` de status anteriores no filtro
  (`lida` só aceita vir de `enviada`/`entregue`) impede que um recibo de
  entrega atrasado, chegando fora de ordem, faça o visto azul voltar a cinza.
- **`fromSelfDevice` é ignorado.** Esse recibo é o **próprio vendedor** lendo
  no celular dele, e fala das mensagens que ele *recebeu* — tratá-lo aqui
  marcaria a mensagem dele como "lida pelo cliente" sozinha. É, por outro
  lado, o caminho que resolveria a limitação de "leitura pelo celular não
  chega à plataforma" (ver a seção do sino): mesmo evento, outro uso.
- `played` (áudio ouvido) entra como `lida`, que é o que o WhatsApp mostra.
  `inactive` é ignorado — não diz nada sobre entrega.

**Mensagem antiga não ganha recibo retroativo:** o WhatsApp não reenvia
recibos de mensagens já confirmadas, então o que está no histórico continua
com um risco. Vale para as novas.

Verificado em dev pela rota interna: lote de duas viradas para `entregue`,
leitura de uma delas para `lida`, e o recibo de entrega atrasado na já lida
devolvendo `0 atualizadas`. Os status usados no teste foram revertidos — não
vieram do WhatsApp.

### Mensagem enviada pelo celular do vendedor (2026-08-18)

Era a decisão que estava em aberto desde o começo, e o relato que a fechou foi
direto: o vendedor respondeu quatro mensagens pelo WhatsApp e **nenhuma**
apareceu na plataforma. `if (chave.fromMe) return` no handler `message` —
o comentário ao lado dizia que ela "é registrada como saída", mas o código só
descartava.

Agora entra como **saída**, com o mesmo tratamento das demais:

- **Não conta como não lida** e **não vira notificação**: ele acabou de
  escrevê-la. Contar faria o badge subir pela resposta dele mesmo.
- **`pushName` é ignorado quando a mensagem é própria** — ali ele traz o nome
  do **vendedor**, e usá-lo renomearia o contato para o nome de quem atende.
- **A regra de privacidade vale nos dois sentidos**: contato sem vínculo com
  cliente continua sem conteúdo gravado, tenha o cliente escrito ou o vendedor.
  Conversa pessoal dele no mesmo aparelho não entra na plataforma.
- **O eco do que a plataforma mandou chega por aqui também**, com o mesmo
  `externoId` que ela já gravou — o upsert por
  `(empresaId, conversaId, externoId)` absorve, sem linha duplicada. Foi o que
  tornou a mudança segura.
- Entra como `enviada`: o recibo do destinatário ainda não passou pela
  plataforma, e o evento `receipt` a leva a entregue/lida como qualquer outra.

**Continua de fora:** a **reação** que o vendedor faz pelo celular
(`if (chave.fromMe) return` no `message_addon`) — mesma lacuna, um andar
abaixo.

### Lista de conversas: nome do WhatsApp na segunda linha (2026-08-18)

A segunda linha mostrava a prévia da última mensagem. Passou a mostrar **o
nome que veio do WhatsApp**: com o contato vinculado, a primeira linha é a
razão social do cliente, e o nome pelo qual o vendedor conhece a pessoa — o
que aparece no celular dele — não estava em lugar nenhum da lista. Sem
vínculo, a primeira linha já é esse nome, então a segunda mostra o telefone
formatado.

`ultimaMensagemPrevia` continua no contrato e na resposta da API; só deixou de
ser exibido.

---

## Estado real em 2026-08-15 (fim da segunda sessão de implementação)

Os quatro itens que estavam em aberto (ver seção seguinte, mantida como
histórico): **1, 2 e 3 entregues**; o **4 (feed do sino) continua pendente**.
Além deles, o usuário pediu na mesma sessão os **recursos de uma conversa
normal de WhatsApp** e as **ações do sistema para contato vinculado a
cliente** — ambos entregues.

### O que passou a funcionar

- **A sessão sobrevive a deploy.** O worker chama
  `GET /whatsapp/interno/sessoes-ativas` ao subir e reabre cada sessão
  `conectada` — sem QR, porque a credencial já está persistida. O retry **não
  desiste**: satura em 5 min e continua, porque desistir deixaria todos os
  vendedores fora do ar num deploy em que a API demora a subir.
- **A sessão sobrevive à queda de conexão.** A biblioteca **não reconecta
  sozinha** (`connection` com `status: 'close'` é responsabilidade nossa);
  agora há reconexão com backoff, distinguindo queda de rede (reconecta) de
  credencial morta ou banimento (não insiste e avisa o vendedor).
- **O banco reflete a realidade da conexão.** Rota interna
  `POST /whatsapp/interno/sessao-estado`: o worker avisa por conta própria
  quando cai, quando volta e quando o aparelho é removido pelo celular. Antes
  o banco guardava a última intenção da tela, e a tela dizia "conectado"
  enquanto nada chegava.
- **Agenda do celular na tela** (`/whatsapp/agenda/contatos`), com busca,
  cruzada com a carteira: mostra quem já é cliente e sugere o cliente quando o
  telefone aponta para **um** só. Nada disso é gravado — a lista é lida do
  aparelho e cruzada em memória.
- **Iniciar conversa** (`POST /whatsapp/conversas`) por contato da agenda, por
  cliente da carteira ou por número digitado.
- **Conversa com os recursos que se espera de um WhatsApp:** anexo de
  documento e de foto/vídeo, **áudio gravado na tela** (vai como mensagem de
  voz, `ptt`), mídia recebida exibida no lugar certo (imagem aparece, áudio
  toca, documento vira link), **responder citando** uma mensagem, indicadores
  de entrega e recibo de leitura (some o "não lido" do celular do vendedor).
- **Ações do sistema dentro da conversa**, só para contato vinculado a
  cliente e cada uma com a permissão da rotina dona do dado: enviar títulos em
  aberto, enviar últimas notas, agendar visita/retorno. Nenhuma consulta
  própria — todas delegam ao service que a tela já usa, como no catálogo do
  agente.

### Decisões tomadas ao implementar (e o motivo)

- **A API não lê as tabelas da biblioteca.** O plano previa `GRANT` de leitura
  no schema `whatsapp` para o role da API. Foi descartado: dar `SELECT` ali
  significaria dar acesso à tabela de credenciais, e **quem lê essa tabela
  fala pelo WhatsApp do vendedor**. Agenda e conversas passam pelo worker, que
  é a camada que já conhece o Zapo — a Fase 2 continua valendo inteira.
- **`dddPadrao` na configuração da empresa** (migration
  `20260815131000_whatsapp_ddd_padrao`). Descoberto na base real: **a maioria
  dos telefones de cliente está sem DDD** (8 ou 9 dígitos). Completar por
  dedução manda mensagem para um desconhecido em outro estado, então o DDD é
  configuração explícita — em branco, o sistema recusa e pede o número.
- **Mídia recebida é baixada em dois passos.** O worker manda os metadados,
  a API responde `arquivoNecessario` e só então o arquivo é baixado. É o que
  impede guardar no servidor a mídia de conversa que a regra de privacidade
  manda **não** gravar.
- **Contato é resolvido por telefone, não só por jid.** O WhatsApp entrega o
  mesmo contato ora como `...@lid` (opaco), ora como `...@s.whatsapp.net`;
  sem isso a mesma pessoa viraria duas conversas, e o vínculo com o cliente
  ficaria em só uma delas.
- **`status@broadcast` e `@newsletter` são ignorados** — chegam como mensagem
  mas não são atendimento; sem o filtro viravam conversa na tela.

### Armadilhas novas (nenhuma aparece em build)

- **O app-state sync não roda ao conectar.** É preciso chamar
  `client.chat.sync()` explicitamente — sem isso a agenda nunca chega e a tela
  fica sem contato para vincular. Foi o que fez a primeira versão parecer que
  "a biblioteca não traz contatos".
- **O provedor manda só o delta** desde a versão guardada. Como as tabelas de
  agenda só passaram a existir depois do primeiro pareamento, o que já tinha
  sido sincronizado não voltava. Daí o botão **"atualizar agenda"**, que zera
  as versões de app-state e força o snapshot completo (776 contatos vieram
  assim, no teste real).
- **As conversas do aparelho (`threads`) só chegam no history sync**, que o
  WhatsApp envia no **primeiro** connect após o pareamento. Numa sessão
  pareada antes disso a lista fica vazia — e só um novo pareamento a traz. Os
  contatos, esses vêm pelo app-state a qualquer momento.
- **O `connect()` da biblioteca fica pendente até o QR ser lido.** Esperar por
  ele seguraria a resposta HTTP por minutos; `iniciar` agora dispara a conexão
  e devolve na hora, e o QR chega por evento.
- **O corpo JSON padrão do Express (100 kB) não serve**: a mídia chega do
  worker em base64. Está em 24 MB (`useBodyParser` em `main.ts`), que cobre o
  teto de 16 MB do próprio WhatsApp.
- **Erro de injeção derruba o `--watch` da API para valer** — o container fica
  de pé com o processo morto, e o worker acumula falha de restauração. Foi o
  caso de `NotasSaidaService`, que não estava exportado no módulo.

### Bloqueios de deploy em produção (descobertos em 2026-08-17, não corrigidos)

O worker **não sobe em produção hoje**, por três motivos independentes. Nada
disso aparece em dev, onde o `docker-compose.dev.yml` já traz a configuração
certa:

1. **A imagem não é publicada.** `publish.ps1` builda e envia só `api` e
   `web`; o `stack.rcgcba.prod.yml` referencia
   `bjsoftware/rcgcba-whatsapp-worker:latest`, que não existe no Docker Hub. O
   Dockerfile de produção existe (`docker/whatsapp-worker.Dockerfile`, Node 22)
   e nunca foi buildado.
2. **A `DATABASE_URL` do worker está errada no stack.** Ele recebe a mesma
   `${DATABASE_URL}` da API, que é o role `plataforma_app` — sem DDL e sem
   acesso ao schema `whatsapp`. O worker precisa do role `whatsapp_store` com
   `search_path=whatsapp` (ver dev, linha do serviço `whatsapp-worker`). Com a
   URL da API, a biblioteca falha ao rodar as migrations dela na conexão.
3. **A senha do role é placeholder de desenvolvimento**
   (`whatsapp_store_dev_only`, definida na migration
   `20260815024500_whatsapp_store_schema`). Precisa ser trocada em produção —
   mesmo tratamento que o `plataforma_app` recebeu. Quem tem essa senha **fala
   pelo WhatsApp dos vendedores**.

Nada disso está no `docs/runbook-operacao.md`, que não menciona WhatsApp em
nenhum ponto. Ao corrigir, registrar lá — é a fonte única.

### Ao retomar: por onde continuar

Na ordem, do mais barato ao mais caro:

1. ~~**Feed do sino**~~ — **feito em 2026-08-18** (ver a seção daquela data).
   Falta a conferência visual na tela.
2. **Duas decisões do usuário, pendentes** (ver seção anterior): definir o
   `dddPadrao` em Administração > WhatsApp, e decidir se vale reparear o
   aparelho para trazer o histórico de conversas do celular.
3. ~~**Orçamento pela conversa**~~ — **feito em 2026-08-17** (ver a seção
   daquela data). Falta só o teste de envio real, com aparelho pareado.
4. **Fatia 3 (governança), que não é opcional antes de produção:** expurgo por
   retenção (`retencaoDias` já é configurável, a rotina que apaga não existe)
   e registro de leitura de conversa alheia.
5. **Os três bloqueios de deploy em produção** (seção acima): imagem do worker
   não publicada, `DATABASE_URL` errada no stack e senha placeholder do role
   `whatsapp_store`.

Para validar qualquer coisa ponta a ponta: os três containers (`api`, `web`,
`whatsapp-worker`) precisam de **restart**, não de watch — e um erro de
injeção do Nest mata o `--watch` da API de vez, deixando o container de pé com
o processo morto. Ver `docs/runbook-operacao.md`.

### O que ficou de fora, e por quê

- **Feed de notificações no sino** (item 4 da lista original): não foi feito
  nesta sessão — ficou pronto em 2026-08-18, ver a seção daquela data.
- **Boleto e DANFE em PDF** continuam fora: a plataforma não emite nem guarda
  esses arquivos. As ações mandam os **dados** (número, vencimento, valor).
- **Expurgo por retenção** (`retencaoDias` já é configurável, mas a rotina que
  apaga não existe) e o **registro de leitura de conversa alheia** seguem
  pendentes — são da Fatia 3.

---

## Estado em 2026-08-15 (fim da primeira sessão de implementação)

**Funciona ponta a ponta:** pareamento por QR (sessão real, credenciais
persistidas), a API fala com o worker autenticada, e mensagem recebida percorre
worker → API → regra de vínculo → banco.

**Requisito adicional do usuário, ainda não implementado:** a tela de Atendimento
precisa das *funções padrão do WhatsApp* — **histórico de conversas e agenda de
contatos** —, para que o vendedor possa **vincular contatos a clientes** a partir
do que já existe no aparelho, sem depender de alguém escrever primeiro.

### Os quatro itens em aberto, na ordem recomendada (histórico — ver seção acima)

1. **Restaurar sessões no boot do worker.** O endpoint já existe
   (`GET /api/v1/whatsapp/interno/sessoes-ativas`, autenticado pelo token); falta
   o worker chamá-lo ao subir e reabrir cada sessão. Sem isso **todo deploy
   derruba o atendimento de todos os vendedores** até cada um reconectar na mão.
2. **Trazer agenda e conversas para a tela.** O store agora grava `contacts` e
   `threads` no schema `whatsapp` — mas **nada lê de lá**. Falta: `GRANT` de
   leitura para o role da API (numa migration, explícito), o serviço que lê essas
   tabelas e as apresenta como contatos vinculáveis, e a UI.
3. **Botão de iniciar conversa**, buscando por cliente da carteira **e** por
   contato da agenda.
4. **Feed de notificações** no sino (hoje é placeholder): não lidas do WhatsApp +
   atividades pendentes/agendadas, com link. O backend já tem `totalNaoLidas`.

### A linha de privacidade, depois da revisão do usuário

| Domínio | Situação | Por quê |
|---|---|---|
| `contacts`, `threads` | **gravados** | é o que permite ver e vincular a clientes |
| `messages` | **`'none'`** | guardar o texto de conversa não vinculada arquivaria a conversa pessoal do vendedor |

Conteúdo de mensagem de contato **vinculado** é gravado pela API em
`whatsapp_mensagens`, no instante em que chega. Gravação retroativa continua não
acontecendo.

### Armadilhas descobertas executando (nenhuma aparece em build)

- **A biblioteca faz DDL a cada conexão**, não só na primeira. Por isso existe o
  role `whatsapp_store`, dono do schema `whatsapp` (migration
  `20260815024500`), sem acesso nenhum às tabelas de negócio. Não tente resolver
  com `GRANT` nas tabelas — não basta.
- **`search_path` no role** (migration `20260815025500`): o `?schema=` da URL é
  convenção do Prisma, o driver `pg` ignora.
- **Node 22 obrigatório** no worker: a `zapo-js` declara `>=20.9.0` mas usa o
  `WebSocket` global, que só existe no 22. API e web seguem no 20.
- **Rotas da API são versionadas** (`/api/v1/...`): o worker entregava em
  `/api/whatsapp/interno/mensagem` e morria num 404 silencioso.
- **Dev não recarrega de forma confiável** — nem o `tsc --watch` do worker, nem o
  Turbopack do web (rota nova/movida exige reiniciar o container). Confirme que a
  mudança está no `dist` em execução antes de concluir que ela não funcionou.

## Fora de escopo (registrado)

- Emissão de boleto e DANFE (dependem de integração bancária/ERP inexistente).
- Chatbot automático respondendo cliente sem vendedor — o agente Grok pode **sugerir**
  resposta, mas responder sozinho no nome do vendedor é outra decisão, com outro risco.
- Multi-atendimento (vários vendedores no mesmo número) e fila de atendimento.
- Campanhas/disparo em massa — é exatamente o padrão que faz o número ser banido.

### Arquivos críticos (quando implementar)

- `apps/whatsapp-worker/**` (serviço novo)
- `apps/api/src/modules/whatsapp/transport/**` (interface + Zapo + Cloud API)
- `apps/api/prisma/schema.prisma` (5 models + migration com RLS)
- `packages/contracts/src/whatsapp.ts`
- `apps/web/src/app/(app)/comercial/whatsapp/**`
- `docker/stack.rcgcba.prod.yml` (serviço do worker — **sem Redis**, ver Fase 1)

## Fontes consultadas (2026-08-14)

- [Zapo — repositório](https://github.com/vinikjkkj/zapo)
- Zapo — [README](https://github.com/vinikjkkj/zapo/blob/master/README.md),
  [issues](https://github.com/vinikjkkj/zapo/issues?q=is%3Aissue),
  histórico de commits e estatística de participação (via API do GitHub), consultados
  em 2026-08-14 para a análise de manutenção acima
- [WhatsApp Cloud API vs Unofficial Libraries Compared](https://whatsapp.checkleaked.cc/blog/whatsapp-cloud-api-vs-unofficial)
- [WhatsApp Multi-Device Protocol: A 2026 Dev Guide](https://whatsapp.checkleaked.cc/blog/whatsapp-multi-device-protocol)
- [WhatsApp Automation Ban Risk 2026 — Kraya AI](https://blog.kraya-ai.com/whatsapp-automation-ban-risk)
- [Why Cheap WhatsApp Bots Get Your Number Banned — SporeSec](https://sporesec.com/en/blog/whatsapp-unofficial-api-ban-risk)
