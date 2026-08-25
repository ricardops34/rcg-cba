# Integração com Evolution GO

## 1. Objetivo e situação atual

Este documento avalia como a
[Evolution GO](https://github.com/evolution-foundation/evolution-go) pode atender
às funções atualmente fornecidas pelo `zapo-js` no Atendimento por WhatsApp.

> A Evolution GO ainda não está implementada neste projeto. Esta é uma proposta
> de arquitetura e um levantamento de compatibilidade. O transporte operacional
> atual continua sendo `zapo`/`zapo-js`.

A Evolution GO é uma API não oficial baseada em sessão pareada do WhatsApp. Ela
assume responsabilidades hoje mantidas pelo `whatsapp-worker`: conexão ao
WhatsApp, credenciais da sessão, QR Code, reconexão e emissão de eventos.

Ela não elimina os riscos próprios de integrações não oficiais. Mudanças no
protocolo podem interromper sessões, e o número conectado pode sofrer restrição
ou bloqueio.

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

A API deve possuir uma abstração de provedor no lado do domínio:

```ts
interface WhatsappProvider {
  conectar(...): Promise<...>;
  obterPareamento(...): Promise<...>;
  consultarEstado(...): Promise<...>;
  desconectar(...): Promise<void>;
  reconectar(...): Promise<void>;
  remover(...): Promise<void>;
  enviarTexto(...): Promise<...>;
  enviarArquivo(...): Promise<...>;
  marcarComoLida(...): Promise<void>;
  reagir(...): Promise<void>;
  listarContatos(...): Promise<...>;
}
```

Implementações previstas:

- `ZapoJsProvider`, adaptando o worker atual;
- `EvolutionGoProvider`, chamando a API da Evolution GO;
- `MetaCloudApiProvider`, para a API Oficial quando implementada.

O provedor seria escolhido pela configuração `transporte` da empresa. As regras
de atendimento, agendamento, ações comerciais, RBAC e persistência comercial
continuariam na API e não seriam delegadas à Evolution GO.

## 4. Dados necessários

### Configuração administrativa

Uma configuração Evolution GO precisa, no mínimo, de:

| Campo | Finalidade |
|---|---|
| `baseUrl` | Endereço interno da Evolution GO |
| `globalApiKey` | Chave administrativa, armazenada cifrada |
| `webhookUrl` | Callback interno da API |
| `versaoEsperada` | Versão da imagem homologada |
| `ativo` | Libera ou bloqueia novas operações |

### Sessão do vendedor

Cada `whatsapp_sessoes` deve associar:

- empresa e vendedor;
- provedor `evolution_go`;
- ID externo da instância;
- nome técnico da instância;
- token exclusivo da instância, cifrado;
- estado local e último erro;
- número conectado e datas operacionais.

Qualquer migration que adicione `empresaId` ou crie tabela de negócio deve
habilitar RLS e criar a policy de isolamento na mesma migration, conforme o
`AGENTS.md` e o guia de migrations do projeto.

## 5. Criação e conexão de uma instância

Fluxo proposto para o botão **Conectar vendedor**:

1. Validar empresa, vendedor, permissão e aceite de privacidade.
2. Gerar nome técnico determinístico e token aleatório exclusivo.
3. Criar a instância por `POST /instance/create`.
4. Conectar por `POST /instance/connect`, informando webhook e eventos.
5. Inscrever, no mínimo, `MESSAGE`, `SEND_MESSAGE`, `READ_RECEIPT`,
   `CONNECTION`, `QRCODE`, `CONTACT` e `HISTORY_SYNC`.
6. Consultar e apresentar QR Code ou código de pareamento.
7. Processar `PairSuccess`/`Connected` e atualizar a sessão local.

As operações administrativas devem manter significados distintos:

- **Desconectar:** interrompe temporariamente e preserva credenciais;
- **Reconectar:** solicita nova conexão usando a sessão persistida;
- **Sair do WhatsApp:** executa `logout` e exige novo pareamento;
- **Remover instância:** executa `logout`, quando aplicável, e depois `delete`.

## 6. Eventos e idempotência

Para a primeira versão, webhook é suficiente. RabbitMQ pode ser avaliado se o
volume ou a garantia de entrega exigir fila persistente.

O receptor na API deve:

1. identificar empresa, vendedor e sessão pelo `instanceId`;
2. rejeitar instâncias desconhecidas ou removidas;
3. deduplicar mensagens e recibos pelos identificadores externos;
4. aceitar repetição e eventos fora de ordem;
5. enfileirar o processamento e responder HTTP rapidamente;
6. não registrar tokens ou conteúdo sensível em logs;
7. manter as escritas comerciais dentro de `withTenant(empresaId, ...)`.

A documentação informa retentativas para webhooks, mas não apresenta uma
assinatura HMAC claramente definida. A URL deve permanecer na rede interna do
Docker. Se o serviço for externo, o callback precisará de proteção adicional,
como mTLS, proxy autenticado ou segredo dedicado, além da validação da instância.

Não se deve habilitar webhook global e webhook por instância simultaneamente
sem uma estratégia explícita de deduplicação.

## 7. Privacidade e mídia sob demanda

Para preservar a regra atual de só armazenar conteúdo de contatos vinculados a
clientes, a configuração inicial recomendada é:

```env
WEBHOOK_FILES=false
DATABASE_SAVE_MESSAGES=false
```

Fluxo da mídia:

1. receber o evento e persistir somente os metadados permitidos;
2. confirmar o vínculo do telefone com um cliente da empresa;
3. recuperar a mídia por `POST /message/downloadimage`;
4. validar tamanho e MIME, armazenar no mecanismo privado da aplicação;
5. eliminar o envelope técnico temporário.

O endpoint de download exige o objeto original da mensagem recebido no evento.
Esse envelope pode ficar em cache cifrado com TTL curto ou em uma fila privada,
mas não deve se transformar em armazenamento permanente paralelo.

## 8. Contatos, conversas e histórico

`GET /user/contacts` pode substituir a leitura transitória da agenda. A API
continua responsável por normalizar o telefone, cruzá-lo com clientes e limitar
o resultado à empresa ativa.

Para conversas, `POST /chat/history-sync` e os eventos `HISTORY_SYNC` não são um
substituto confirmado para `listarConversas()`. A lista exibida ao vendedor deve
continuar sendo construída a partir de `whatsapp_conversas` e
`whatsapp_mensagens`.

Não é recomendável habilitar `DATABASE_SAVE_MESSAGES` apenas para montar essa
lista, pois isso duplicaria conteúdo fora das regras comerciais e de retenção da
aplicação.

## 9. Segurança

- Nunca expor `GLOBAL_API_KEY` ou token de instância ao navegador.
- Cifrar credenciais armazenadas pela aplicação.
- Não publicar a porta da Evolution GO diretamente na Internet.
- Fixar timeouts, limites de resposta e tamanho de upload no cliente HTTP.
- Restringir `baseUrl` a destinos administrativos permitidos para evitar SSRF.
- Remover ou mascarar segredos, QR Codes e objetos de mensagem dos logs.
- Usar um token diferente para cada instância.
- Manter os bancos técnicos da Evolution GO separados das tabelas comerciais.
- Fixar uma versão Docker; não utilizar `latest` em produção.

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

1. Fixar uma versão Docker e registrar seu checksum.
2. Subir Evolution GO e PostgreSQL técnico somente na rede interna.
3. Executar a prova de conceito e congelar exemplos reais de payloads.
4. Implementar `EvolutionGoProvider` e o receptor idempotente de eventos.
5. Adicionar `evolution_go` à configuração, às migrations e à tela por abas.
6. Habilitar uma empresa e um vendedor piloto.
7. Manter `zapo-js` disponível como fallback durante a homologação.
8. Comparar estabilidade, latência, reconexão e completude funcional.
9. Somente depois decidir se o worker `zapo-js` poderá ser descontinuado.

## 12. Conclusão

A Evolution GO cobre a maior parte do atendimento atual e simplifica a gestão
externa de instâncias, QR Codes e credenciais. Ela não deve ser considerada uma
substituição direta até que respostas citadas, reações recebidas, mídia tardia,
histórico e recuperação de sessões sejam comprovados na versão homologada.

A adoção recomendada é incremental, por provedor e por vendedor, preservando as
regras comerciais e de privacidade na API e mantendo `zapo-js` como fallback no
período de validação.
