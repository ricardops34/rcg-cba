# WhatsApp do vendedor — atendimento com as ferramentas da plataforma

> Plano de implementação registrado em 2026-08-14. Ainda não implementado — serve
> como referência para quando a implementação começar.

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

### Sobre o Zapo especificamente

Analisado em 2026-08-14 (`github.com/vinikjkkj/zapo`):

- Implementação própria do protocolo WhatsApp Web em TypeScript, **sem depender de
  Baileys ou whatsapp-web.js**. Licença MIT.
- Pareamento por **QR code** (`auth_qr` → `auth_paired`), multi-sessão, stores
  plugáveis (SQLite, Redis, Postgres, MongoDB), zero dependências obrigatórias em
  runtime, acelerador cripto em Rust opcional, e um servidor MCP para agentes LLM.
- **Ponto de atenção:** criado em **março de 2026** (5 meses), **181 estrelas, 58
  forks, 3 watchers**. Comparação: o Baileys tem ~9,9 mil estrelas e anos de estrada.
  É um projeto jovem, de mantenedor essencialmente único.

O risco aqui é somado, não alternativo: além do banimento (que vale para qualquer
biblioteca não oficial), há o risco de o projeto parar. O protocolo do WhatsApp muda
sem aviso; biblioteca sem manutenção quebra e não volta. A camada de transporte da
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
- Conversa com a API por **fila/pub-sub no Redis**. Atenção: o `docker-compose.dev.yml`
  já define `REDIS_URL` e sobe um Redis, **mas nenhum código usa** e **o stack de
  produção (`stack.rcgcba.prod.yml`) não tem Redis nenhum** — precisa ser adicionado.
- Estado de sessão persistido **cifrado** (AES-256-GCM, mesma `AGENTE_IA_CRYPTO_KEY`
  ou chave irmã): a credencial de sessão dá acesso ao WhatsApp do vendedor, é segredo
  de verdade.
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

**O PDF do orçamento é gerado no navegador hoje** (`apps/web/src/lib/orcamento-pdf.ts`,
jsPDF). Para anexar no WhatsApp o arquivo precisa existir no servidor — ou o front
envia o PDF gerado como upload, ou a geração migra para o backend. A segunda é mais
correta e é trabalho próprio, que precisa entrar na conta.

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
- `docker/stack.rcgcba.prod.yml` (Redis + serviço do worker)

## Fontes consultadas (2026-08-14)

- [Zapo — repositório](https://github.com/vinikjkkj/zapo)
- [WhatsApp Cloud API vs Unofficial Libraries Compared](https://whatsapp.checkleaked.cc/blog/whatsapp-cloud-api-vs-unofficial)
- [WhatsApp Multi-Device Protocol: A 2026 Dev Guide](https://whatsapp.checkleaked.cc/blog/whatsapp-multi-device-protocol)
- [WhatsApp Automation Ban Risk 2026 — Kraya AI](https://blog.kraya-ai.com/whatsapp-automation-ban-risk)
- [Why Cheap WhatsApp Bots Get Your Number Banned — SporeSec](https://sporesec.com/en/blog/whatsapp-unofficial-api-ban-risk)
