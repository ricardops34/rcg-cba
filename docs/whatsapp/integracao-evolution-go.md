# Integração com Evolution GO

## 1. Objetivo e situação atual

Este documento descreve a integração com a
[Evolution GO](https://github.com/evolution-foundation/evolution-go) como
transporte alternativo ao `zapo-js` no Atendimento por WhatsApp.

> **Implementada, e bloqueada por licença do fornecedor.** O provedor, o
> webhook, a configuração e a tela existem no código (2026-08-27), e as rotas
> foram conferidas contra o gateway em execução. Mas a versão 0.7.2 **exige
> licença ativada**: sem ela, toda a API responde `503 LICENSE_REQUIRED`. O
> transporte em produção continua sendo `zapo`/`zapo-js`. Ver a seção 1.1.

### 1.1. A licença é um bloqueio, não um detalhe

Ao subir `evoapicloud/evolution-go:0.7.2` num ambiente isolado (2026-08-27), o
serviço inicia normalmente e imprime:

```text
╔══════════════════════════════════════════════════════════╗
║              License Registration Required               ║
╚══════════════════════════════════════════════════════════╝
Server starting without license.
API endpoints will return 503 until license is activated.
```

E qualquer chamada, mesmo com a `GLOBAL_API_KEY` correta, responde:

```json
{
  "code": "LICENSE_REQUIRED",
  "error": "service not activated",
  "message": "License required. Open the manager to activate your license.",
  "register_url": "http://<host>/manager/login"
}
```

`GET /license/register` devolve uma URL de registro em
`license.evolutionfoundation.com.br`. Ou seja: **usar a Evolution GO depende de
uma decisão comercial com o fornecedor**, não de configuração. Enquanto a
licença não for ativada, o transporte não funciona, por mais correto que o
código esteja.

Três rotas ficam disponíveis sem licença: `GET /server/ok`, `/license/*` e
`/swagger/*` — foi pelo Swagger que o contrato real desta integração foi
levantado.

**Consequência para o plano:** a prova de conceito da seção 10 não pode ser
executada antes dessa decisão. O que foi possível verificar sem licença (rotas,
corpos de requisição, variáveis de ambiente) já está aplicado no código; o que
depende de tráfego real (formato das respostas, payload dos eventos do webhook,
`data:` URI no envio de mídia) continua sem confirmação.

A Evolution GO é uma API não oficial baseada em sessão pareada do WhatsApp. Ela
assume responsabilidades hoje mantidas pelo `whatsapp-worker`: conexão ao
WhatsApp, credenciais da sessão, QR Code, reconexão e emissão de eventos.

Ela não elimina os riscos próprios de integrações não oficiais. Mudanças no
protocolo podem interromper sessões, e o número conectado pode sofrer restrição
ou bloqueio.

### O que existe no código

| Peça | Onde |
|---|---|
| Contrato de provedor | `apps/api/src/modules/whatsapp/providers/whatsapp-provider.ts` |
| Roteador por sessão | `providers/whatsapp-provider.service.ts` |
| Cliente HTTP do gateway | `providers/evolution-go.client.ts` |
| Provedor | `providers/evolution-go.provider.ts` |
| Webhook | `whatsapp-evolution.controller.ts` |
| Cifragem dos segredos | `whatsapp-cripto.ts` (`WHATSAPP_CRYPTO_KEY`) |
| Colunas | migration `20260828120000_whatsapp_evolution_go` |
| Serviço no stack | `docker/stack.rcgcba.prod.yml`, `docker/docker-compose.dev.yml` |

### O que foi verificado contra o serviço real (2026-08-27)

Imagem `evoapicloud/evolution-go:0.7.2` subida em ambiente isolado. Sem licença
não há tráfego de WhatsApp, mas Swagger e tabela de rotas são acessíveis, e foi
delas que saíram as correções abaixo — todas já aplicadas no código:

| A documentação dizia | O serviço faz |
|---|---|
| `DATABASE_URL` / `DATABASE_URI` | `POSTGRES_DB` recebe a **DSN inteira**; sem `POSTGRES_AUTH_DB` e `POSTGRES_USERS_DB` o processo morre em panic |
| `instanceId` no corpo/query das operações | Nenhuma rota de operação o recebe: identifica pela credencial no cabeçalho |
| `events` no connect | `subscribe` |
| `webhook` no connect | `webhookUrl` |
| `phone`/`jid`/`message` no envio | `number` e `text` |
| `quotedMessageId` | `quoted: { messageId }` |
| `emoji` na reação | `reaction`, com `id` e `fromMe` |
| `messageId` em markread | `id`, e é **lista** |
| `GET /user/avatar` | `POST /user/avatar` com `{number, preview}` |
| Mídia em base64 no envio | Campo `url` — a plataforma manda `data:` URI |
| Uma rota de download por tipo | Uma só: `/message/downloadmedia` |
| Dias no history-sync | `count` (número de mensagens) |
| Listar conversas do aparelho | **Não existe** rota para isso |

### Decisões tomadas na implementação

- **Um transporte por empresa**, escolhido em Administração → WhatsApp; a linha
  de cada sessão guarda com qual provedor ela foi conectada, e é esse o que
  atende as operações dela.
- **Dois segredos por instância**: o token que a API usa para falar com o
  gateway e o segredo que o gateway usa para chamar a API de volta. Separados
  porque vazar um não deve entregar o outro, e o do webhook pode ser trocado sem
  repareamento. Os dois vão cifrados (AES-256-GCM).
- **A leitura tolerante do corpo é intencional**: os nomes de campo mudaram
  entre versões, e o cliente procura o valor em vários caminhos em vez de
  quebrar. O Swagger da imagem em execução continua sendo o contrato final.
- **Reparear em outro provedor faz logout no anterior** — sem isso a instância
  antiga continuaria pareada ao celular do vendedor, recebendo mensagens que a
  API já não escuta.

## 2. Compatibilidade com o contrato atual

O contrato usado pelo worker está definido em
`apps/whatsapp-worker/src/transport/whatsapp-transport.ts`.

| Função atual | Evolution GO | Implementação ou ressalva |
|---|---|---|
| Criar instância por vendedor | Sim | `POST /instance/create` |
| Conectar e obter QR Code | Sim | `POST /instance/connect` e `GET /instance/qr` |
| Parear por código telefônico | Sim | `POST /instance/pair` |
| Consultar estado | Sim | `GET /instance/status` |
| Reconectar | Sim | `POST /instance/reconnect` |
| Desconectar preservando sessão | Sim | `POST /instance/disconnect` |
| Encerrar sessão do WhatsApp | Sim | `DELETE /instance/logout` |
| Excluir instância | Sim | `DELETE /instance/delete/:instanceId` |
| Enviar texto | Sim | `POST /send/text` |
| Responder citando mensagem | Não garantido | Há divergência entre documentação e versões; validar em prova de conceito |
| Enviar imagem, vídeo, áudio e documento | Sim | `POST /send/media` |
| Receber mensagens | Sim | Evento `Message` por webhook |
| Capturar mensagens enviadas pelo celular | Sim | Eventos `Message`/`SendMessage`, com deduplicação por ID |
| Baixar mídia somente após autorização | Sim | `WEBHOOK_FILES=false` e download posterior pelo objeto do evento |
| Marcar mensagem como lida | Sim | `POST /message/markread` |
| Receber recibos de entrega e leitura | Sim | Categoria `READ_RECEIPT`, evento `Receipt` |
| Enviar reação | Sim | `POST /message/react` |
| Receber reação | A validar | Documentada entre os eventos de mensagem; validar o payload da versão fixada |
| Listar contatos | Sim | `GET /user/contacts` |
| Listar conversas | Parcial | Há sincronização de histórico, mas não um equivalente direto confirmado de `listarConversas()` |
| Tratar JID telefônico e `@lid` | Sim | Versões recentes normalizam `Sender`, `SenderAlt` e JIDs |
| Restaurar sessões após reinício | Sim | A Evolution GO persiste credenciais no PostgreSQL; comportamento deve ser testado |

Referências oficiais:

- [Referência geral da API](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/referencia/api-reference.md)
- [Gerenciamento de instâncias](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/guias-api/api-instances.md)
- [Mensagens e mídia](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/guias-api/api-messages.md)
- [Sistema de eventos](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/recursos-avancados/events-system.md)
- [Changelog](https://github.com/evolution-foundation/evolution-go/blob/main/CHANGELOG.md)

## 3. Arquitetura proposta

```text
Navegador
   | HTTPS + JWT/RBAC
   v
API NestJS -------------------- PostgreSQL / schema public
   |                               dados comerciais + RLS
   |
   | HTTP + credencial interna
   v
Evolution GO ------------------ PostgreSQL próprio
   |                               sessões e estado técnico
   v
WhatsApp

Evolution GO -- webhook interno --> API NestJS
```

A Evolution GO deve ser implantada como serviço separado. Ela não deve ser
incorporada ao processo atual do `whatsapp-worker`, porque já exerce a função de
gerenciador das conexões e sessões.

A abstração de provedor foi implementada em
`apps/api/src/modules/whatsapp/providers/whatsapp-provider.ts`:

```ts
interface WhatsappProvider {
  iniciar(ctx, { arquivarMensagens }): Promise<DadosInstancia | null>;
  pareamento(ctx): Promise<EstadoPareamento>;
  desconectar(ctx): Promise<void>;      // pausa, preserva credencial
  sairDoWhatsapp(ctx): Promise<void>;   // logout, exige novo QR
  removerInstancia(ctx): Promise<void>; // logout + delete
  enviarTexto(ctx, dados): Promise<{ externoId }>;
  enviarArquivo(ctx, dados): Promise<{ externoId }>;
  marcarLida(ctx, dados): Promise<void>;
  reagir(ctx, dados): Promise<void>;
  listarContatos(ctx, busca?): Promise<ContatoAparelho[]>;
  listarConversas(ctx): Promise<ContatoAparelho[]>;
  obterFotoContato(ctx, jid): Promise<FotoContato | null>;
  sincronizarAgenda(ctx): Promise<void>;
  importarHistorico(ctx, dias): Promise<{ encontradas; conversas }>;
}
```

Implementações:

- `ZapoProvider`, casca fina sobre o worker atual — o protocolo do worker não
  mudou nesta migração;
- `EvolutionGoProvider`, chamando a API da Evolution GO;
- a API Oficial continua sem implementação.

`desconectar`, `sairDoWhatsapp` e `removerInstancia` são três operações
distintas porque na Evolution GO elas de fato diferem. No zapo as três colapsam
numa só — a `zapo-js` não separa pausar de deslogar —, e isso é limitação do
transporte, não escolha de desenho.

O provedor é escolhido pelo `transporte` da **sessão**, com o da empresa como
padrão no momento do pareamento. As regras de atendimento, agendamento, ações
comerciais, RBAC e persistência comercial continuam na API e não são delegadas
à Evolution GO.

## 4. Dados necessários

### Configuração administrativa (`whatsapp_config`)

| Coluna | Finalidade |
|---|---|
| `transporte` | `evolution_go` quando a empresa está neste provedor |
| `evolutionUrl` | Endereço interno da Evolution GO |
| `evolutionApiKeyCifrada` | Chave administrativa, AES-256-GCM; nenhuma rota de leitura a devolve |
| `evolutionVersao` | Versão da imagem homologada, registrada por quem implantou |
| `ativo` | Libera ou bloqueia novas conexões e o atendimento |

O `webhookUrl` **não** é configurável: ele é derivado de
`WHATSAPP_EVOLUTION_WEBHOOK_BASE_URL` e carrega empresa, sessão e o segredo da
instância. Deixá-lo editável abriria caminho para apontar o callback de um
tenant para outro endereço.

### Sessão do vendedor (`whatsapp_sessoes`)

| Coluna | Finalidade |
|---|---|
| `transporte` | Provedor com que **esta** sessão foi conectada |
| `instanciaExterna` | Nome técnico determinístico (`rcg-<sessaoId>`) |
| `instanciaId` | Identificador devolvido pelo gateway |
| `instanciaTokenCifrado` | Token exclusivo da instância |
| `webhookSegredoCifrado` | Segredo que autentica o gateway chamando a API |

Ambas as tabelas já tinham RLS por empresa; a migration só acrescenta colunas,
então não há policy nova a criar — ver
`apps/api/prisma/migrations/README.md`.

## 5. Criação e conexão de uma instância

Fluxo implementado no botão **Conectar** do vendedor:

1. Validar empresa, vendedor, permissão e aceite de privacidade.
2. Gerar nome técnico determinístico e token aleatório exclusivo.
3. Criar a instância por `POST /instance/create`.
4. Conectar por `POST /instance/connect`, informando webhook e eventos.
5. Inscrever, no mínimo, `MESSAGE`, `SEND_MESSAGE`, `READ_RECEIPT`,
   `CONNECTION`, `QRCODE`, `CONTACT` e `HISTORY_SYNC`.
6. Consultar e apresentar QR Code ou código de pareamento.
7. Processar `PairSuccess`/`Connected` e atualizar a sessão local.

As operações administrativas mantêm significados distintos:

- **Desconectar:** interrompe temporariamente e preserva credenciais;
- **Reconectar:** solicita nova conexão usando a sessão persistida;
- **Sair do WhatsApp:** executa `logout` e exige novo pareamento;
- **Remover instância:** executa `logout`, quando aplicável, e depois `delete`.

Onde cada uma aparece hoje: "Remover conexão" (`DELETE /whatsapp/sessao` e
`DELETE /whatsapp/config/sessoes/:id`) faz logout; "Excluir instância"
(`DELETE /whatsapp/config/sessoes/:id/instancia`) faz logout e delete;
"Reconectar" chama o mesmo caminho de `iniciar`, que também **re-registra o
webhook** — uma instância que voltou do restart do gateway sem webhook fica
conectada e muda, que é o pior estado possível.

## 6. Eventos e idempotência

Para a primeira versão, webhook é suficiente. RabbitMQ pode ser avaliado se o
volume ou a garantia de entrega exigir fila persistente.

Como o receptor (`WhatsappEvolutionController`) resolve cada ponto:

1. **empresa e sessão vêm na URL**, não do `instanceId` do corpo: o webhook
   chega sem tenant no contexto e as tabelas têm RLS — sem a empresa, a API não
   localizaria nem a própria sessão para descobrir de quem é o evento;
2. sessão inexistente, de outro transporte ou com segredo divergente responde
   **401**, nunca 404: o callback não é lugar de informar a um chamador não
   autenticado o que existe deste lado;
3. a deduplicação é a mesma do worker — chave única
   `(empresaId, conversaId, externoId)` e `upsert`;
4. recibo atrasado não retrocede status (`lida` não volta para `entregue`), e
   mensagem repetida não gera nova notificação;
5. o processamento é **inline**, sem fila: falha de uma mensagem do lote é
   registrada e não derruba as outras. Se o volume exigir, é aqui que uma fila
   entra;
6. o cliente HTTP registra só método e caminho — nunca corpo nem credencial;
7. todas as escritas passam pelos services existentes, que já usam
   `withTenant(empresaId, ...)`.

A documentação informa retentativas para webhooks, mas não apresenta uma
assinatura HMAC claramente definida. Daí o **segredo por instância**, gerado no
pareamento, gravado cifrado e comparado em tempo constante. Ele viaja na query
da URL porque a documentação não garante cabeçalho customizado no webhook — um
segredo que o gateway não sabe enviar não protege nada; o controller aceita
também `Authorization: Bearer` para quando a versão suportar.

A URL deve permanecer na rede interna do Docker. Se o serviço for externo, o
callback precisará de proteção adicional, como mTLS ou proxy autenticado, além
do segredo por instância.

Não se deve habilitar webhook global e webhook por instância simultaneamente
sem uma estratégia explícita de deduplicação — a plataforma registra sempre o
webhook por instância.

## 7. Privacidade e mídia sob demanda

Para preservar a regra de só armazenar conteúdo de contatos vinculados a
clientes, os dois serviços do stack já sobem com:

```env
WEBHOOK_FILES=false
DATABASE_SAVE_MESSAGES=false
```

E a criação de cada instância repete o pedido no corpo (`webhookFiles: false`,
`saveMessages: false`), porque a configuração do serviço pode mudar sem que o
módulo saiba.

Fluxo da mídia, como está implementado:

1. o webhook entrega **só os metadados** e a API decide se grava;
2. mensagem de contato sem cliente vinculado não é gravada — e aí a mídia nunca
   é buscada;
3. gravada, a resposta traz `arquivoNecessario` e só então
   `POST /message/download*` é chamado;
4. o arquivo vai para o diretório privado da aplicação, com nome opaco;
5. falha no download não derruba o recebimento: a mensagem já está gravada e a
   conversa precisa aparecer, mesmo sem o anexo.

O endpoint de download exige o objeto original da mensagem, e ele vem **do
próprio webhook**, na mesma requisição. Não há cache de envelope: guardá-lo
criaria justamente o armazenamento paralelo que a regra evita.

## 8. Contatos, conversas e histórico

`GET /user/contacts` substitui a leitura transitória da agenda. A API continua
responsável por normalizar o telefone, cruzá-lo com clientes e limitar o
resultado à empresa ativa. O filtro de busca é aplicado **na API**: a rota não
documenta parâmetro de busca, e uma busca ignorada pelo servidor devolveria a
agenda inteira como se fosse o resultado.

Para conversas do aparelho, `POST /chat/history-sync` e os eventos
`HISTORY_SYNC` não são um substituto confirmado para `listarConversas()`. O
provedor tenta as rotas prováveis (`/chat/list`, `/chats`, `/user/chats`) e, se
nenhuma existir na versão instalada, devolve **lista vazia** — nunca a agenda de
contatos disfarçada de conversas, que encheria a tela de gente com quem o
vendedor nunca falou. A lista de atendimento não depende disso: ela vem de
`whatsapp_conversas` e `whatsapp_mensagens`, como sempre.

Não é recomendável habilitar `DATABASE_SAVE_MESSAGES` apenas para montar essa
lista, pois isso duplicaria conteúdo fora das regras comerciais e de retenção da
aplicação.

## 9. Segurança

O que já está garantido no código:

- a `GLOBAL_API_KEY` e o token de instância **nunca** vão para o navegador: a
  rota de leitura da configuração devolve só `evolutionApiKeyDefinida` e os
  últimos 4 caracteres;
- credenciais gravadas vão cifradas (AES-256-GCM, `WHATSAPP_CRYPTO_KEY`);
- timeout (`WHATSAPP_EVOLUTION_TIMEOUT_MS`, 15 s) e teto de resposta
  (`WHATSAPP_EVOLUTION_MAX_RESPOSTA_BYTES`, 32 MB) no cliente HTTP — o teto
  existe porque uma das rotas devolve mídia em Base64;
- o log do cliente registra só método, caminho e status;
- token diferente por instância, e um segundo segredo, também por instância,
  para o webhook;
- foto de contato só é aproveitada quando vem embutida: buscar uma URL
  arbitrária devolvida por um serviço é o desenho que vira SSRF, e foto de
  contato não vale esse risco.

O que depende da implantação, e por isso está no runbook:

- não publicar a porta da Evolution GO na Internet (sem labels do Traefik);
- manter o banco técnico do gateway separado das tabelas comerciais;
- fixar uma versão Docker; não utilizar `latest` em produção.

## 10. Pontos que exigem prova de conceito

Antes de liberar o transporte, a versão escolhida deve passar por testes de
contrato para:

- resposta citada em texto e mídia;
- envio e recebimento de reação;
- áudio comum e áudio do tipo PTT;
- download tardio de imagem, vídeo, áudio, documento e sticker;
- mensagem enviada diretamente pelo celular conectado;
- recibos de enviado, entregue, lido e reproduzido;
- contatos novos e números migrados para `@lid`;
- sincronização inicial de contatos e histórico;
- restauração automática após reinício do serviço e do PostgreSQL;
- desconexão, reconexão, logout e exclusão definitiva;
- várias instâncias simultâneas;
- idempotência e ordem dos webhooks;
- comportamento quando o callback fica indisponível.

Há relatos oficiais que merecem acompanhamento durante a homologação:

- [resposta citada ausente em determinadas versões](https://github.com/evolution-foundation/evolution-go/issues/27);
- [erro 463 envolvendo tokens de privacidade de contatos](https://github.com/evolution-foundation/evolution-go/issues/50);
- [falha em evento de arquivamento na versão 0.7.1](https://github.com/evolution-foundation/evolution-go/issues/95).

O Swagger da imagem executada deve ser tratado como contrato final, pois alguns
nomes de endpoint, headers e payloads diferem entre páginas da documentação.

## 11. Estratégia de adoção

Feito (2026-08-27):

1. ~~Implementar `EvolutionGoProvider` e o receptor idempotente de eventos.~~
2. ~~Adicionar `evolution_go` à configuração, às migrations e à tela por abas.~~
3. ~~Subir Evolution GO e PostgreSQL técnico somente na rede interna~~ — os
   serviços estão no `docker/stack.rcgcba.prod.yml` e no compose de dev.

Falta, e é o que separa isto de um transporte utilizável em produção:

4. Fixar a versão Docker em produção. A imagem é `evoapicloud/evolution-go`
   (Docker Hub) e a última estável verificada em 2026-08-27 é a **0.7.2**;
   `EVOLUTION_GO_IMAGE` não tem valor padrão no stack de propósito.
5. Executar a prova de conceito da seção 10 e congelar exemplos reais de
   payloads — ajustando aqui o que divergir.
6. Habilitar uma empresa e um vendedor piloto.
7. Manter `zapo-js` como fallback durante a homologação: voltar é trocar o
   transporte na tela e reparear.
8. Comparar estabilidade, latência, reconexão e completude funcional.
9. Somente depois decidir se o worker `zapo-js` poderá ser descontinuado.

## 12. Conclusão

A Evolution GO cobre a maior parte do atendimento atual e simplifica a gestão
externa de instâncias, QR Codes e credenciais. Ela **ainda não** deve ser
considerada substituta do `zapo-js`: o código existe, mas respostas citadas,
reações recebidas, mídia tardia, histórico e recuperação de sessões não foram
observados contra um gateway em execução — foram implementados a partir de uma
documentação que diverge entre versões.

A adoção continua sendo incremental, preservando as regras comerciais e de
privacidade na API e mantendo `zapo-js` disponível no período de validação.
