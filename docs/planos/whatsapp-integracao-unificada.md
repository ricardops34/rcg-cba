# Plano — integração unificada de WhatsApp (`zapo-js` e Evolution GO)

> Plano registrado em 2026-08-25. Este documento não representa funcionalidade
> já implementada. O transporte operacional atual permanece `zapo`/`zapo-js`.

## 1. Objetivo

Criar uma única camada de integração para que os serviços de sessão, agenda,
conversas, mensagens, agendamentos e ações comerciais não conheçam detalhes do
`zapo-js` nem da Evolution GO.

A escolha do provedor deve poder ser feita por empresa e registrada em cada
sessão. A implantação será gradual: sessões existentes continuam no Zapo enquanto
sessões piloto podem nascer na Evolution GO.

Este plano cobre dois provedores:

- `zapo`: conexão mantida pelo `apps/whatsapp-worker`;
- `evolution_go`: conexão mantida por um serviço Evolution GO independente.

A API Oficial permanece como extensão futura, sem fazer parte da implementação
deste plano.

## 2. Problema da arquitetura atual

Já existe uma boa interface `WhatsappTransport` em
`apps/whatsapp-worker/src/transport/whatsapp-transport.ts`, mas ela está dentro do
worker. Fora dele, os serviços da API dependem diretamente de
`WhatsappWorkerClient`:

```text
WhatsappSessaoService -----+
WhatsappConversasService --+--> WhatsappWorkerClient --> Zapo worker
WhatsappAgendaService -----+
WhatsappAgendamentoService-+
```

Esse limite é adequado para trocar a biblioteca interna do worker, mas não para
trocar o tipo de infraestrutura. A Evolution GO já é um gerenciador externo de
instâncias e não deve ser colocada dentro do worker Node.

O novo limite precisa estar na API:

```text
Serviços de domínio
       |
       v
WhatsappProviderRegistry
       |
       +--> ZapoProvider --------> WhatsappWorkerClient
       |
       +--> EvolutionGoProvider -> EvolutionGoClient
```

## 3. Princípios da solução

1. **Domínio independente do provedor.** Serviços de negócio só usam contratos
   normalizados.
2. **Provedor imutável durante a vida da sessão.** Trocar a configuração da empresa
   não converte silenciosamente uma sessão conectada.
3. **Migração explícita.** Para mudar de provedor, desconectar/remover a sessão
   anterior e criar outra no destino.
4. **Capacidades declaradas.** A interface não deve prometer recursos que um
   provedor não entrega de forma confiável.
5. **Eventos idempotentes.** Webhooks, callbacks e ecos podem se repetir.
6. **Segredos somente no backend.** Tokens, chaves e objetos técnicos não chegam ao
   navegador.
7. **Privacidade antes do conteúdo.** Mídia e texto só são persistidos depois da
   validação do vínculo com cliente.
8. **RLS obrigatório.** Toda nova tabela de negócio com `empresaId` recebe RLS e
   policy na mesma migration.

## 4. Contrato unificado na API

Criar a pasta:

```text
apps/api/src/modules/whatsapp/providers/
  whatsapp-provider.ts
  whatsapp-provider.registry.ts
  zapo/
    zapo.provider.ts
  evolution-go/
    evolution-go.client.ts
    evolution-go.provider.ts
    evolution-go-webhook.controller.ts
    evolution-go-event.mapper.ts
```

Contrato inicial:

```ts
type WhatsappProviderKind = 'zapo' | 'evolution_go';

interface WhatsappProvider {
  readonly kind: WhatsappProviderKind;

  capacidades(): WhatsappProviderCapabilities;

  iniciar(contexto: SessaoProviderContext): Promise<void>;
  obterPareamento(contexto: SessaoProviderContext): Promise<EstadoPareamento>;
  obterEstado(contexto: SessaoProviderContext): Promise<EstadoPareamento>;
  desconectar(contexto: SessaoProviderContext): Promise<void>;
  reconectar(contexto: SessaoProviderContext): Promise<void>;
  remover(contexto: SessaoProviderContext): Promise<void>;

  enviarTexto(input: EnviarTextoProviderInput): Promise<MensagemEnviadaProvider>;
  enviarArquivo(input: EnviarArquivoProviderInput): Promise<MensagemEnviadaProvider>;
  marcarLida(input: MarcarLidaProviderInput): Promise<void>;
  reagir(input: ReagirProviderInput): Promise<void>;

  listarContatos(contexto: SessaoProviderContext, busca?: string): Promise<ContatoAgenda[]>;
  listarConversas(contexto: SessaoProviderContext, limite?: number): Promise<ConversaAparelho[]>;
  ressincronizarAgenda(contexto: SessaoProviderContext): Promise<void>;
}
```

Os handlers de eventos não devem fazer parte dessa interface. No Zapo, os eventos
chegam aos endpoints internos atuais; na Evolution GO, chegam por webhook. Ambos
devem ser convertidos para o mesmo `WhatsappInboundEventService`.

## 5. Capacidades por provedor

Criar um contrato explícito para o frontend e para os serviços:

```ts
interface WhatsappProviderCapabilities {
  qrCode: boolean;
  pairingCode: boolean;
  quotedText: boolean;
  quotedMedia: boolean;
  reactions: boolean;
  receipts: boolean;
  contacts: boolean;
  deviceChats: boolean;
  historySync: boolean;
  pttAudio: boolean;
  lazyMediaDownload: boolean;
}
```

O registro resolve o provedor e suas capacidades:

```ts
providerRegistry.obter(sessao.transporte);
providerRegistry.capacidades(config.transporte);
```

Quando uma operação não for suportada, a API deve responder com erro funcional
estável, por exemplo `WHATSAPP_RECURSO_NAO_SUPORTADO`, e não tentar adaptar
silenciosamente. Exemplo: remover a citação de uma resposta mudaria o significado
da ação do usuário.

As capacidades da Evolution GO devem ser determinadas por testes contra a versão
Docker homologada, não somente pela documentação online.

## 6. Contexto normalizado da sessão

Nenhum provider deve consultar tabelas por conta própria para descobrir o tenant.
O serviço chamador monta um contexto mínimo:

```ts
interface SessaoProviderContext {
  empresaId: string;
  sessaoId: string;
  vendedorId: string;
  transporte: WhatsappProviderKind;
  externoId: string | null;
}
```

O contexto não contém segredo. Cada provider busca sua configuração cifrada pelo
`empresaId` e os identificadores técnicos da sessão pelo `sessaoId`, sempre dentro
de `PrismaService.withTenant`.

## 7. Normalização de eventos

Criar um serviço único de entrada:

```ts
class WhatsappInboundEventService {
  mensagem(evento: MensagemRecebida): Promise<void>;
  reacao(evento: ReacaoRecebida): Promise<void>;
  recibo(evento: ReciboRecebido): Promise<void>;
  estado(evento: EstadoSessao): Promise<void>;
  contatos(evento: ContatosSincronizados): Promise<void>;
}
```

Fluxos:

```text
Zapo worker callback ----> ZapoEventMapper --------+
                                                   +--> WhatsappInboundEventService
Evolution GO webhook ---> EvolutionGoEventMapper --+
```

Regras obrigatórias:

- localizar a sessão por `(transporte, externoId)` ou pelo `sessaoId` confiável;
- obter `empresaId` antes de qualquer acesso às tabelas com RLS;
- validar que a instância pertence à empresa;
- normalizar JID, `@lid`, telefone, direção, tipos, datas e IDs;
- deduplicar mensagem por identificador externo dentro do escopo adequado;
- aceitar recibos e reações antes ou depois da mensagem principal;
- nunca confiar no `empresaId` enviado pelo provedor externo;
- descartar conteúdo de contato não vinculado conforme a regra de privacidade.

## 8. Configuração dos provedores

Evitar colocar todos os campos em `whatsapp_config`. A configuração comum continua
nessa tabela; credenciais e opções específicas ficam em tabelas próprias.

### Configuração comum

`whatsapp_config`:

- `ativo`;
- `transportePadrao` — renome lógico do campo `transporte` atual;
- `dddPadrao`;
- demais decisões comuns da empresa.

### Configuração Zapo

`whatsapp_config_zapo`:

- `empresaId` único;
- `workerUrl`;
- campos operacionais futuros do worker.

O segredo compartilhado do worker pode continuar em variável de ambiente se for
global para a implantação.

### Configuração Evolution GO

`whatsapp_config_evolution_go`:

- `empresaId` único;
- `baseUrl`;
- `globalApiKeyCifrada`;
- `versaoHomologada`;
- `webhookAtivo` e opções de eventos, se necessárias.

As duas tabelas são de negócio, possuem `empresaId` e precisam de RLS na mesma
migration.

### Dados técnicos da sessão

Adicionar a `whatsapp_sessoes`:

- `externoId`: ID da instância no provedor;
- `externoNome`: nome técnico para operação;
- `tokenCifrado`: token exclusivo da instância Evolution GO, quando aplicável;
- `providerMetadata`: apenas metadados técnicos indispensáveis e não sensíveis.

Criar unicidade adequada, preferencialmente:

```text
(empresaId, transporte, externoId)
```

Não reutilizar `credencialCifrada` para conteúdos de formatos diferentes sem antes
definir claramente sua finalidade. As credenciais Signal do Zapo continuam no
store técnico do worker; o token HTTP da Evolution GO fica cifrado na aplicação.

## 9. Seleção e migração do provedor

### Nova sessão

1. Ler `whatsapp_config.transportePadrao`.
2. Criar a sessão já com esse transporte.
3. Resolver o provider pela sessão, não novamente pela configuração.
4. Criar a instância externa e iniciar o pareamento.

### Sessão existente

Todas as operações usam `whatsapp_sessoes.transporte`. Alterar o padrão da empresa
afeta somente sessões novas ou migrações explicitamente confirmadas.

### Migração de Zapo para Evolution GO

Não existe portabilidade segura de credencial entre os provedores. O fluxo é:

1. bloquear novos envios na sessão durante a migração;
2. aguardar ou cancelar mensagens agendadas em processamento;
3. desconectar/remover a sessão no provedor anterior;
4. preservar conversas e mensagens comerciais existentes;
5. alterar o transporte e limpar identificadores técnicos antigos em transação;
6. criar a instância Evolution GO;
7. exigir novo pareamento;
8. liberar envios após `Connected`.

Um erro após o passo 3 deve deixar a sessão como desconectada e permitir tentativa
manual; nunca alternar automaticamente entre provedores, pois isso pode duplicar
envios ou criar duas conexões para o mesmo número.

## 10. Implementação do ZapoProvider

O `ZapoProvider` será um adaptador fino sobre `WhatsappWorkerClient`:

- preserva os endpoints internos atuais do worker;
- traduz o contexto normalizado para caminhos `/sessoes/*`;
- implementa `reconectar` como nova inicialização da sessão persistida;
- separa semanticamente `desconectar` e `remover`;
- converte erros HTTP do worker para erros normalizados do domínio.

O `WhatsappTransport` do worker continua existindo porque ainda isola o Zapo da
implementação HTTP do worker. A unificação na API complementa essa interface; não a
substitui imediatamente.

## 11. Implementação do EvolutionGoProvider

O `EvolutionGoClient` será responsável somente por HTTP:

- autenticação administrativa e por instância;
- timeouts e cancelamento;
- serialização dos payloads da versão homologada;
- limites de resposta e upload;
- tradução de status e erros;
- logs sem chaves, tokens, QR ou conteúdo de mensagem.

O provider orquestra:

- criação, conexão, QR, pairing code e status;
- desconexão, reconexão, logout e exclusão;
- envio de texto e mídia;
- leitura, reação, contatos e sincronização;
- configuração do webhook por instância.

O endpoint de webhook deve ficar separado dos callbacks do worker e chamar o mesmo
serviço normalizado. A URL deve ser interna sempre que os serviços compartilharem a
mesma infraestrutura.

## 12. Mídia sob demanda

O contrato atual entrega ao handler uma função `baixarMidia()`. Esse conceito deve
ser preservado no serviço normalizado, mas a implementação difere:

- Zapo: closure que chama a biblioteca com o evento ainda em memória;
- Evolution GO: referência opaca ao envelope original, guardada temporariamente e
  usada no endpoint de download.

Criar uma abstração como:

```ts
interface WhatsappMediaReference {
  provider: WhatsappProviderKind;
  sessaoId: string;
  referenciaId: string;
  expiraEm: Date;
}
```

O envelope da Evolution GO deve ficar em armazenamento temporário cifrado com TTL,
ou em fila privada, e ser apagado após download ou expiração. A implementação não
deve habilitar persistência indiscriminada de arquivos ou mensagens na Evolution
GO.

## 13. Alterações nos serviços existentes

Substituir gradualmente `WhatsappWorkerClient` por `WhatsappProviderRegistry` em:

- `WhatsappSessaoService`;
- `WhatsappConversasService`;
- `WhatsappAgendaService`;
- `WhatsappAgendamentoService`.

`WhatsappAcoesService` não deve conhecer providers: ele gera a ação ou o arquivo e
delega o envio ao fluxo normal de conversas.

Ordem segura de refatoração:

1. implementar registry e `ZapoProvider` sem mudar comportamento;
2. migrar um serviço por vez;
3. manter os testes atuais passando;
4. remover injeções diretas do worker somente quando não houver consumidor;
5. então implementar `EvolutionGoProvider`.

## 14. API e frontend

As rotas públicas de atendimento devem permanecer estáveis. O frontend não escolhe
URLs nem envia credenciais; ele recebe:

- transporte da sessão;
- estado normalizado;
- capacidades disponíveis;
- método de pareamento disponível;
- código de erro funcional normalizado.

A tela administrativa pode ter as abas:

1. **Geral** — ativação, provedor padrão e DDD;
2. **Zapo** — URL e teste do worker;
3. **Evolution GO** — URL, chave, versão e teste de conexão;
4. **Instâncias** — vendedor, provedor, número, estado, conectar, reconectar,
   desconectar e remover.

Botões como responder citando, reagir ou gravar PTT devem respeitar as capacidades
da sessão, não apenas a configuração atual da empresa.

## 15. Segurança e observabilidade

### Segurança

- cifrar chaves da Evolution GO com chave própria ou serviço criptográfico comum;
- nunca devolver segredo em DTO de leitura;
- validar `baseUrl` contra destinos permitidos para reduzir risco de SSRF;
- não publicar worker ou Evolution GO diretamente;
- autenticar callbacks e limitar corpo/taxa;
- conferir vínculo entre evento, instância e sessão antes de usar o tenant;
- executar escritas com `withTenant(empresaId, ...)`;
- mascarar telefone e IDs sensíveis nos logs quando não forem necessários.

### Observabilidade

Padronizar métricas e logs com:

- `provider`;
- `empresaId` e `sessaoId` como IDs estruturados, sem conteúdo;
- operação;
- duração;
- resultado e código de erro;
- número de retentativas;
- idade do último evento/conexão.

Métricas mínimas:

- sessões conectadas por provider;
- falhas de conexão/reconexão;
- mensagens enviadas, recebidas e com erro;
- webhooks duplicados ou rejeitados;
- downloads de mídia autorizados e descartados;
- latência por operação e provider.

## 16. Fases de entrega

### Fase 0 — contrato e testes de caracterização

- congelar o comportamento atual do Zapo em testes;
- catalogar endpoints internos e erros atuais;
- definir DTOs normalizados e códigos de erro;
- definir matriz inicial de capacidades.

**Saída:** testes que permitem refatorar sem alterar o atendimento atual.

### Fase 1 — unificação usando somente Zapo

- criar `WhatsappProvider`, registry e `ZapoProvider`;
- redirecionar os quatro serviços que usam `WhatsappWorkerClient`;
- criar serviço único de eventos;
- manter API pública e frontend sem mudanças funcionais.

**Saída:** produção continua em Zapo, mas o domínio não depende mais do worker.

### Fase 2 — modelo e configuração Evolution GO

- adicionar enum `evolution_go` nos contratos e Prisma;
- criar tabelas de configuração específicas com RLS;
- adicionar campos técnicos da sessão e índices;
- criar cifragem e DTOs sem exposição de segredo;
- preparar abas administrativas.

**Saída:** configuração persistida, ainda sem liberar vendedores.

### Fase 3 — cliente e ciclo de instâncias

- implementar cliente HTTP;
- criar, conectar, obter QR/código, consultar, reconectar e remover;
- implementar teste de conectividade administrativa;
- adicionar gestão das instâncias.

**Saída:** vendedor piloto conecta uma instância Evolution GO.

### Fase 4 — mensagens e eventos

- enviar texto e arquivos;
- receber mensagens, estados, recibos e reações;
- implementar deduplicação e normalização de JID/LID;
- tratar mídia sob demanda;
- implementar contatos e sincronização possível.

**Saída:** atendimento piloto de ponta a ponta.

### Fase 5 — capacidades e diferenças funcionais

- executar testes de contrato da versão Docker fixada;
- habilitar somente capacidades comprovadas;
- adaptar frontend por capability;
- documentar limitações de citação, conversas, PTT e histórico.

**Saída:** nenhuma função é anunciada sem suporte real do provider ativo.

### Fase 6 — piloto e migração controlada

- habilitar uma empresa e poucos vendedores;
- monitorar estabilidade e reconexão;
- ensaiar rollback operacional para Zapo com novo pareamento;
- documentar runbook e critérios de ampliação.

**Saída:** decisão baseada em operação real antes da expansão.

## 17. Estratégia de testes

### Testes unitários

- registry resolve o provider correto;
- mappers normalizam todos os eventos conhecidos;
- capabilities bloqueiam funções ausentes;
- erros externos viram códigos estáveis;
- segredos não aparecem em respostas ou logs.

### Testes de contrato

Executar contra Zapo worker e imagem Evolution GO fixada:

- conexão, QR, status, reconexão, logout e remoção;
- texto simples e citado;
- imagem, documento, vídeo, áudio e PTT;
- reação adicionada e removida;
- recibos;
- mensagens enviadas pelo aparelho;
- contatos, histórico e JID/LID;
- mídia baixada somente após autorização.

### Testes de integração da API

- cada evento duplicado produz uma única mensagem;
- evento de instância desconhecida é recusado;
- empresa A não acessa sessão da empresa B;
- contato sem cliente não persiste conteúdo;
- mensagem agendada usa o provider da sessão;
- troca do padrão da empresa não altera sessões existentes;
- falha parcial de migração não cria dois providers ativos.

### Testes operacionais

- reiniciar API, provider e PostgreSQL em ordens diferentes;
- indisponibilidade e lentidão do webhook;
- rotação de chaves;
- várias instâncias simultâneas;
- backup e restauração do banco técnico;
- atualização e rollback da imagem Evolution GO.

## 18. Critérios de aceite

A integração unificada estará pronta quando:

1. nenhum serviço de domínio depender diretamente de `WhatsappWorkerClient`;
2. Zapo continuar atendendo sem regressão observável;
3. uma sessão resolver sempre o provider gravado nela;
4. Evolution GO realizar o ciclo completo de instância e atendimento piloto;
5. eventos dos dois providers produzirem os mesmos DTOs internos;
6. duplicidade de webhook/callback não duplicar mensagens ou ações;
7. RLS impedir acesso cruzado entre empresas;
8. nenhum token ou credencial aparecer no frontend ou logs;
9. mídia de contato não vinculado não for baixada nem persistida;
10. funções não comprovadas forem ocultadas ou bloqueadas por capability;
11. existir runbook de conexão, reconexão, remoção, atualização e rollback.

## 19. Fora do escopo

- migração automática de credenciais entre Zapo e Evolution GO;
- alternância automática de provider em caso de falha;
- disparo em massa ou campanhas;
- chatbot autônomo;
- API Oficial da Meta;
- persistência de todas as mensagens dentro da Evolution GO;
- alta disponibilidade da Evolution GO sem validação específica do seu modelo de
  concorrência e sessão.

## 20. Decisões que devem ser confirmadas na implementação

1. Versão Docker exata da Evolution GO a homologar.
2. Estratégia temporária para o envelope necessário ao download de mídia.
3. Forma de proteção do webhook quando Evolution GO estiver fora da rede interna.
4. Semântica final de `remover`: somente `logout` ou `logout` seguido de `delete`.
5. Política para mensagens agendadas durante migração de provider.
6. Se o provider padrão será somente por empresa ou poderá ser escolhido por
   vendedor por um administrador.

## 21. Documentação relacionada

- [Plano funcional do WhatsApp do vendedor](./whatsapp-vendedor.md)
- [Implementação atual com zapo-js](../whatsapp/integracao-zapo-js.md)
- [Análise da Evolution GO](../whatsapp/integracao-evolution-go.md)
- [Endpoints atuais](../whatsapp/endpoints.md)
- [Operação atual](../whatsapp/operacao.md)
