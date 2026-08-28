import { ConsoleLogger, createStore, proto, WaClient } from 'zapo-js';
import { createPostgresStore } from '@zapo-js/store-postgres';
import type {
  ArquivoParaEnviar,
  ContatoAgenda,
  FotoContato,
  ConversaAparelho,
  EstadoPareamento,
  EstadoSessao,
  MensagemRecebida,
  ReacaoRecebida,
  ReciboRecebido,
  WhatsappTransport,
} from './whatsapp-transport';

/**
 * Reconexão: a biblioteca **não** reconecta sozinha ao fechar o socket
 * (`connection` com `status: 'close'`) — é responsabilidade nossa chamar
 * `connect()` de novo. Sem isso, a primeira oscilação de rede derruba o
 * atendimento do vendedor até ele perceber e clicar em conectar.
 *
 * O backoff dobra até o teto para não martelar o servidor do WhatsApp: uma
 * reconexão agressiva é justamente o padrão que faz o número ser marcado.
 */
/** Prefixo das tabelas do store, dentro do schema `whatsapp`. */
const PREFIXO_TABELAS = process.env.WHATSAPP_STORE_PREFIX ?? 'wa_';

/**
 * Teto de mensagens por importação de histórico.
 *
 * Cada uma vira uma chamada à API, e o botão que dispara isso é de
 * administração: sem teto, um aparelho com anos de conversa manteria o worker
 * ocupado por horas. Rodar de novo continua de onde parou, porque a gravação é
 * upsert e o que já entrou não conta como trabalho novo.
 */
const LIMITE_IMPORTACAO = 5_000;

const RECONEXAO_ESPERA_INICIAL_MS = 5_000;
const RECONEXAO_ESPERA_MAXIMA_MS = 5 * 60_000;
const RECONEXAO_MAX_TENTATIVAS = 12;

/**
 * Quedas em que reconectar não adianta — a credencial não vale mais e só um
 * novo pareamento resolve. Insistir nelas queima tentativas e, no caso de
 * banimento, chama atenção para o número.
 */
const MOTIVOS_SEM_RECONEXAO: Record<string, string> = {
  stream_error_device_removed:
    'O aparelho foi desconectado pelo celular (Aparelhos conectados). Leia o QR de novo para voltar a atender.',
  stream_error_force_logout:
    'O WhatsApp encerrou esta sessão. Leia o QR de novo para voltar a atender.',
  failure_not_authorized:
    'A credencial desta sessão não vale mais. Leia o QR de novo para voltar a atender.',
  failure_locked:
    'A conta do WhatsApp está bloqueada. Resolva pelo celular antes de reconectar.',
  primary_identity_key_change:
    'O WhatsApp do celular foi reinstalado ou restaurado. Leia o QR de novo.',
};

/**
 * Implementação sobre o `zapo-js`.
 *
 * **Persistência da sessão.** O estado Signal vai para o Postgres pelo store
 * nativo da biblioteca. Atenção ao que isso significa: a biblioteca **não
 * oferece separação por schema** — só `tablePrefix` (default `wa_` aqui). As
 * tabelas de sessão convivem com as de negócio no mesmo schema, **sem RLS e
 * sem cifra nossa**.
 *
 * A alternativa é um store nosso sobre o Prisma, cifrando cada valor com
 * AES-256-GCM — mais coerente com o resto da plataforma e registrado no plano
 * como preferível. Fica pendente.
 *
 * Enquanto não for feito: **quem lê as tabelas `wa_*` fala pelo WhatsApp do
 * vendedor.** O grant do role de aplicação sobre elas precisa ser revisto antes
 * de produção.
 *
 * Consequência a não esquecer: **quem tem acesso a esse schema fala pelo
 * WhatsApp do vendedor.**
 */
export class ZapoTransport implements WhatsappTransport {
  private readonly clientes = new Map<string, WaClient>();
  private readonly estados = new Map<string, EstadoPareamento>();
  /** sessaoId → empresaId, para devolver o tenant junto da mensagem recebida. */
  private readonly empresas = new Map<string, string>();
  /**
   * Sessões que arquivam o conteúdo das mensagens no store.
   *
   * Existe porque isso é **decisão da empresa**, não do worker: só quem
   * configurou dias de histórico paga o preço de ter as conversas do aparelho
   * gravadas aqui (ver o provider `messages` em `iniciar`). Quem está em zero
   * segue como antes, sem conteúdo nenhum no banco do worker.
   */
  private readonly arquivam = new Set<string>();
  private readonly limpezas = new Map<string, { stop: () => void }>();
  /** Reconexões agendadas, para poder cancelá-las ao desconectar. */
  private readonly reconexoes = new Map<string, NodeJS.Timeout>();
  private readonly tentativas = new Map<string, number>();
  /** O pool é caro e reaproveitável — um para todas as sessões. */
  private pg: ReturnType<typeof createPostgresStore> | null = null;

  private pgStore() {
    if (!this.pg) {
      this.pg = createPostgresStore({
        pool: { connectionString: this.databaseUrl },
        // O schema é separado (`whatsapp`, via search_path do role); o prefixo
        // fica por compatibilidade com o que já foi criado.
        tablePrefix: PREFIXO_TABELAS,
      });
    }
    return this.pg;
  }
  private handler:
    | ((msg: MensagemRecebida, baixarMidia: () => Promise<Buffer>) => Promise<void>)
    | null = null;
  private observador: ((estado: EstadoSessao) => Promise<void>) | null = null;
  private handlerReacao: ((reacao: ReacaoRecebida) => Promise<void>) | null =
    null;
  private handlerRecibo: ((recibo: ReciboRecebido) => Promise<void>) | null =
    null;

  constructor(private readonly databaseUrl: string) {}

  aoReceber(
    handler: (
      msg: MensagemRecebida,
      baixarMidia: () => Promise<Buffer>,
    ) => Promise<void>,
  ) {
    this.handler = handler;
  }

  aoReceberReacao(handler: (reacao: ReacaoRecebida) => Promise<void>) {
    this.handlerReacao = handler;
  }

  aoReceberRecibo(handler: (recibo: ReciboRecebido) => Promise<void>) {
    this.handlerRecibo = handler;
  }

  /**
   * Quando a mensagem foi enviada, segundo o WhatsApp.
   *
   * `messageTimestamp` vem em **segundos**, e pode chegar como número, string
   * ou o objeto Long do protobuf — daí o `Number(...)` sobre o valor bruto em
   * vez de confiar no tipo. Sem carimbo (ou com carimbo absurdo, que já se viu
   * em mensagem de sistema), vale a hora da recepção: uma data errada no rolo
   * é pior do que uma data aproximada.
   */
  private momentoDa(evento: any): Date {
    const bruto = evento?.messageTimestamp;
    const segundos = Number(
      typeof bruto === 'object' && bruto !== null
        ? (bruto.toNumber?.() ?? bruto.low ?? NaN)
        : bruto,
    );
    if (!Number.isFinite(segundos) || segundos <= 0) return new Date();
    const data = new Date(segundos * 1000);
    // Nada do futuro e nada anterior ao WhatsApp existir.
    if (data.getTime() > Date.now() + 60_000) return new Date();
    if (data.getFullYear() < 2009) return new Date();
    return data;
  }

  /**
   * A mensagem recebida é uma reação? Devolve o alvo e o emoji, ou `null`.
   *
   * O alvo vem como uma chave de mensagem (`key`): `id` é o `externoId` que a
   * plataforma guarda, e `fromMe` diz se a mensagem reagida saiu daqui — sem
   * isso não dá para saber se o cliente reagiu ao que o vendedor mandou ou ao
   * que ele mesmo escreveu.
   *
   * Emoji vazio é remoção, e não ausência de reação: é assim que o WhatsApp
   * desfaz.
   */
  /**
   * A mensagem é, na verdade, uma reação — decifrada ou não?
   *
   * A cifrada chega em `encReactionMessage`, e é assim que ela aparece quando
   * o segredo da mensagem pai não está disponível (mensagem anterior a
   * `persistAllSecrets`, por exemplo). Sem cobrir esse caso, a reação volta a
   * cair no `outro` do `interpretar` e vira **bolha vazia** no rolo — que foi
   * exatamente o que aconteceu antes desta verificação existir.
   */
  /**
   * Extrai a reação de uma mensagem, quando ela vem decifrada.
   *
   * **É por aqui que a reação do contato chega de verdade** — no evento
   * `message`, com `reactionMessage` preenchido (`messageContextInfo,
   * reactionMessage` no log). O evento `message_addon`, que a documentação da
   * biblioteca descreve para addons, não dispara neste caminho; o listener
   * dele existe como rede, e a gravação é idempotente por (mensagem, lado),
   * então receber pelos dois não duplica nada.
   *
   * `key.id` é o `externoId` da mensagem reagida e `key.fromMe` diz se ela
   * saiu daqui. Texto vazio é remoção da reação.
   */
  private reacaoDe(
    mensagem: any,
  ): { alvoExternoId: string; alvoNosso: boolean; emoji: string } | null {
    const conteudo =
      mensagem?.ephemeralMessage?.message ??
      mensagem?.viewOnceMessage?.message ??
      mensagem ??
      {};
    const reacao = conteudo?.reactionMessage;
    const alvo = reacao?.key?.id;
    if (!reacao || !alvo) return null;
    return {
      alvoExternoId: String(alvo),
      alvoNosso: Boolean(reacao.key?.fromMe),
      emoji: String(reacao.text ?? ''),
    };
  }

  /** Nomes dos campos preenchidos numa mensagem — só para diagnóstico. */
  private camposDe(mensagem: any): string {
    const conteudo =
      mensagem?.ephemeralMessage?.message ??
      mensagem?.viewOnceMessage?.message ??
      mensagem ??
      {};
    const campos = Object.keys(conteudo ?? {}).filter(
      (chave) => (conteudo as any)[chave] != null,
    );
    return campos.length ? campos.join(',') : '(nenhum)';
  }

  private ehReacao(mensagem: any): boolean {
    const conteudo =
      mensagem?.ephemeralMessage?.message ??
      mensagem?.viewOnceMessage?.message ??
      mensagem ??
      {};
    return Boolean(conteudo?.reactionMessage || conteudo?.encReactionMessage);
  }

  /**
   * Traduz o protobuf da mensagem para o que a plataforma entende.
   *
   * O WhatsApp entrega cada tipo num campo próprio (`imageMessage`,
   * `documentMessage`, …) e a legenda vive dentro do campo da mídia — não há
   * um "texto" único. Tipo desconhecido vira `outro` em vez de erro: uma
   * figurinha nova não pode derrubar o recebimento.
   */
  private interpretar(mensagem: any): {
    tipo: MensagemRecebida['tipo'];
    texto: string | null;
    arquivoNome: string | null;
    arquivoMime: string | null;
    respondeuA: string | null;
  } {
    // Mensagem efêmera/vista-uma-vez vem embrulhada; o conteúdo real está dentro.
    const conteudo =
      mensagem?.ephemeralMessage?.message ??
      mensagem?.viewOnceMessage?.message ??
      mensagem?.viewOnceMessageV2?.message ??
      mensagem ??
      {};

    const citada =
      conteudo?.extendedTextMessage?.contextInfo?.stanzaId ??
      conteudo?.imageMessage?.contextInfo?.stanzaId ??
      conteudo?.videoMessage?.contextInfo?.stanzaId ??
      conteudo?.documentMessage?.contextInfo?.stanzaId ??
      conteudo?.audioMessage?.contextInfo?.stanzaId ??
      null;

    const base = { respondeuA: citada ? String(citada) : null };

    if (conteudo.conversation || conteudo.extendedTextMessage?.text) {
      return {
        ...base,
        tipo: 'texto',
        texto: conteudo.conversation ?? conteudo.extendedTextMessage.text,
        arquivoNome: null,
        arquivoMime: null,
      };
    }
    if (conteudo.imageMessage) {
      return {
        ...base,
        tipo: 'imagem',
        texto: conteudo.imageMessage.caption ?? null,
        arquivoNome: null,
        arquivoMime: conteudo.imageMessage.mimetype ?? 'image/jpeg',
      };
    }
    if (conteudo.videoMessage) {
      return {
        ...base,
        tipo: 'video',
        texto: conteudo.videoMessage.caption ?? null,
        arquivoNome: null,
        arquivoMime: conteudo.videoMessage.mimetype ?? 'video/mp4',
      };
    }
    if (conteudo.audioMessage) {
      return {
        ...base,
        tipo: 'audio',
        texto: null,
        arquivoNome: null,
        arquivoMime: conteudo.audioMessage.mimetype ?? 'audio/ogg',
      };
    }
    if (conteudo.documentMessage || conteudo.documentWithCaptionMessage) {
      const doc =
        conteudo.documentMessage ??
        conteudo.documentWithCaptionMessage?.message?.documentMessage;
      return {
        ...base,
        tipo: 'documento',
        texto: doc?.caption ?? null,
        arquivoNome: doc?.fileName ?? null,
        arquivoMime: doc?.mimetype ?? 'application/octet-stream',
      };
    }
    if (conteudo.locationMessage || conteudo.liveLocationMessage) {
      const loc = conteudo.locationMessage ?? conteudo.liveLocationMessage;
      return {
        ...base,
        tipo: 'localizacao',
        // Guardado como link: é o que o vendedor consegue abrir depois.
        texto: `https://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}`,
        arquivoNome: null,
        arquivoMime: null,
      };
    }
    if (conteudo.contactMessage || conteudo.contactsArrayMessage) {
      const nome =
        conteudo.contactMessage?.displayName ??
        conteudo.contactsArrayMessage?.displayName ??
        'contato';
      return {
        ...base,
        tipo: 'contato',
        texto: nome,
        arquivoNome: null,
        arquivoMime: null,
      };
    }
    return {
      ...base,
      tipo: 'outro',
      texto: null,
      arquivoNome: null,
      arquivoMime: null,
    };
  }

  aoMudarEstado(handler: (estado: EstadoSessao) => Promise<void>) {
    this.observador = handler;
  }

  estado(sessaoId: string): EstadoPareamento {
    return (
      this.estados.get(sessaoId) ?? {
        status: 'desconectada',
        qr: null,
        numero: null,
        erro: null,
      }
    );
  }

  /**
   * Ponto único de escrita do estado — e é por isso que ele existe: qualquer
   * mudança precisa chegar à API, senão o banco guarda a intenção da tela e
   * não o que está acontecendo com a conexão.
   *
   * O aviso não é aguardado: a API fora do ar não pode travar o tratamento de
   * um evento do socket.
   */
  private definirEstado(sessaoId: string, estado: EstadoPareamento) {
    this.estados.set(sessaoId, estado);
    const observador = this.observador;
    if (!observador) return;
    void observador({
      ...estado,
      sessaoId,
      empresaId: this.empresas.get(sessaoId) ?? '',
    }).catch((erro) => {
      console.error(`Falha ao avisar a API sobre a sessão ${sessaoId}`, erro);
    });
  }

  async iniciar(
    sessaoId: string,
    empresaId: string,
    arquivarMensagens = false,
  ): Promise<void> {
    this.empresas.set(sessaoId, empresaId);
    if (arquivarMensagens) this.arquivam.add(sessaoId);
    else this.arquivam.delete(sessaoId);
    // Reentrante de propósito: a tela pode chamar "conectar" duas vezes, e
    // subir um segundo socket para a mesma sessão faz o WhatsApp derrubar o
    // primeiro.
    if (this.clientes.has(sessaoId)) {
      // Só que "conectar" durante uma espera de reconexão precisa ser
      // atendido na hora: o vendedor está olhando a tela, não vai esperar os
      // cinco minutos do backoff.
      const agendada = this.reconexoes.get(sessaoId);
      if (agendada) {
        clearTimeout(agendada);
        this.reconexoes.delete(sessaoId);
        this.tentativas.delete(sessaoId);
        void this.reconectar(sessaoId);
      }
      return;
    }

    const pg = this.pgStore();
    const store = createStore({
      backends: { pg },
      providers: {
        // Autenticação e criptografia persistem: é o que evita pedir QR novo a
        // cada reinício do worker.
        auth: 'pg',
        signal: 'pg',
        preKey: 'pg',
        session: 'pg',
        identity: 'pg',
        senderKey: 'pg',
        appState: 'pg',
        privacyToken: 'pg',
        // Agenda e lista de conversas ficam gravadas: é o que permite ao
        // vendedor **ver quem existe e vincular a clientes**, em vez de
        // depender de alguém escrever primeiro para o contato aparecer.
        contacts: 'pg',
        threads: 'pg',
        // O **conteúdo** das mensagens fica fora por padrão. É a linha que
        // separa "saber que existe uma conversa" de "guardar o que foi dito":
        // sem isto, a conversa do vendedor com a família dele ficaria
        // arquivada aqui, por baixo da regra de só gravar contato vinculado a
        // cliente.
        //
        // Mensagem de contato já vinculado é gravada pela API em
        // `whatsapp_mensagens`, no instante em que chega.
        //
        // A exceção é a empresa que configurou dias de histórico: o lote que o
        // WhatsApp despeja no pareamento só existe aqui dentro, e sem
        // arquivá-lo não há o que importar depois. Quem liga isso aceita
        // guardar no worker o que o aparelho já tinha — inclusive o que nunca
        // vai virar conversa na plataforma, porque o contato não é cliente.
        messages: arquivarMensagens ? 'pg' : 'none',
      },
      // O segredo de 32 bytes de cada mensagem vai para o Postgres — **não** o
      // conteúdo dela. Reação é um "addon" cifrado com o segredo da mensagem
      // que ela aponta, e a biblioteca busca esse segredo neste cache ou no
      // arquivo de mensagens. Como o arquivo é `'none'` por privacidade, sem
      // isto a reação que chega do celular nunca é decifrada — e o padrão
      // (memória) ainda perderia tudo a cada restart do worker.
      cacheProviders: { messageSecret: 'pg' },
    });

    const cliente = new WaClient(
      {
        store,
        sessionId: sessaoId,
        // Guarda o segredo de **toda** mensagem, não só das que a biblioteca
        // sabe de antemão que terão continuação (enquete, evento). Reação pode
        // cair em qualquer mensagem, e sem o segredo do pai ela chega cifrada
        // e é descartada em silêncio.
        addons: { persistAllSecrets: true },
      },
      // A falha de decifrar um addon (reação, voto de enquete) é registrada
      // pela biblioteca em `debug` — em `info` ela some, e o sintoma vira
      // "a reação simplesmente não chega". Daí o nível ser configurável.
      new ConsoleLogger(
        process.env.WHATSAPP_LOG_NIVEL === 'debug' ? 'debug' : 'info',
      ),
    );

    // Sem isto as tabelas de cache do store crescem indefinidamente — a
    // biblioteca não expira nada sozinha no Postgres. Um poller por sessão.
    this.limpezas.set(sessaoId, pg.startCleanup(sessaoId));

    this.definirEstado(sessaoId, {
      status: 'pareando',
      qr: null,
      numero: null,
      erro: null,
    });

    cliente.on('auth_qr', ({ qr }: { qr: string }) => {
      this.definirEstado(sessaoId, {
        status: 'pareando',
        qr,
        numero: null,
        erro: null,
      });
    });

    cliente.on('auth_paired', ({ credentials }: { credentials: { meJid?: string } }) => {
      this.definirEstado(sessaoId, {
        status: 'conectada',
        qr: null,
        numero: this.numeroDe(cliente),
        erro: null,
      });
    });

    // A biblioteca não reconecta sozinha: sem este tratamento, a sessão morre
    // na primeira oscilação de rede e ninguém fica sabendo.
    cliente.on('connection', (evento: any) => {
      if (evento?.status === 'open') {
        this.tentativas.delete(sessaoId);
        this.definirEstado(sessaoId, {
          status: 'conectada',
          qr: null,
          numero: this.numeroDe(cliente),
          erro: null,
        });
        // A agenda não vem sozinha: o app-state sync **não roda no connect**,
        // é preciso pedir. Sem esta chamada, `wa_mailbox_contacts` fica vazia
        // e a tela não tem contato nenhum para o vendedor vincular.
        void this.sincronizarAgenda(sessaoId).catch((erro: unknown) =>
          console.error(`Falha ao sincronizar a agenda de ${sessaoId}`, erro),
        );
        return;
      }
      if (evento?.status === 'close') {
        this.tratarQueda(sessaoId, evento);
      }
    });

    cliente.on('message', async (evento: any) => {
      if (!this.handler) return;
      const chave = evento?.key ?? {};
      // Mensagem que o próprio vendedor mandou **pelo celular** entra como
      // saída, em vez de ser descartada: sem ela o histórico da plataforma
      // fica pela metade, com a pergunta do cliente e sem a resposta.
      //
      // O eco das que a plataforma enviou chega por aqui também, com o mesmo
      // `externoId` que ela já gravou — o upsert da API absorve.
      const minha = Boolean(chave.fromMe);
      const jid = String(chave.remoteJid ?? '');
      // `status@broadcast` são os stories, e `@newsletter` são canais: chegam
      // como mensagem, mas não são atendimento — sem este filtro viram
      // conversa na tela do vendedor.
      if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;

      // Reação não chega por aqui (ver o listener de `message_addon`), mas
      // aparece embrulhada em mensagem quando a biblioteca não consegue
      // decifrar o addon — o caso das mensagens anteriores a
      // `persistAllSecrets`. Descartar é melhor do que gravar: sem este
      // desvio ela cai no `outro` do `interpretar` e vira bolha vazia no rolo.
      if (this.ehReacao(evento?.message ?? {})) {
        const reacao = this.reacaoDe(evento?.message ?? {});
        if (!reacao) {
          // Cifrada e sem o segredo do pai para abrir: nada a gravar, mas
          // também não pode virar mensagem (era a bolha vazia no rolo).
          console.log(
            `Reação ilegível descartada: campos=${this.camposDe(evento?.message)}`,
          );
          return;
        }
        if (this.handlerReacao) {
          await this.handlerReacao({
            sessaoId,
            empresaId: this.empresas.get(sessaoId) ?? '',
            jid,
            alvoExternoId: reacao.alvoExternoId,
            alvoNosso: reacao.alvoNosso,
            emoji: reacao.emoji,
          });
        }
        return;
      }

      const conteudo = this.interpretar(evento?.message ?? {});
      // Tipo que a plataforma não sabe nomear: sem isto, descobrir o que
      // chegou exige adivinhação (foi o caso das reações).
      if (conteudo.tipo === 'outro') {
        console.log(`Mensagem de tipo desconhecido: campos=${this.camposDe(evento?.message)}`);
      }

      await this.handler(
        {
          sessaoId,
          empresaId: this.empresas.get(sessaoId) ?? '',
          externoId: String(chave.id ?? ''),
          jid,
          telefone: await this.telefoneDoJid(sessaoId, jid),
          // Na mensagem própria o `pushName` é o nome do **vendedor**: usá-lo
          // aqui renomearia o contato para o nome de quem atende.
          nomeExibicao: minha ? null : (evento?.pushName ?? null),
          minha,
          texto: conteudo.texto,
          tipo: conteudo.tipo,
          arquivoNome: conteudo.arquivoNome,
          arquivoMime: conteudo.arquivoMime,
          respondeuA: conteudo.respondeuA,
          // A hora que o **WhatsApp** carimbou, não a da recepção aqui: no
          // pareamento chega um lote do que já aconteceu, e datar tudo como
          // "agora" empilharia meses de conversa no dia de hoje.
          criadaEm: this.momentoDa(evento),
        },
        // Só é chamado se a API responder que gravou a mensagem.
        async () => Buffer.from(await (cliente as any).message.downloadBytes(evento)),
      );
    });

    /**
     * Reação vinda do celular.
     *
     * Vem por um evento **próprio** (`message_addon`) e não pelo `message`:
     * reação é um "addon" cifrado com o segredo da mensagem que ela aponta —
     * foi o que fez a primeira versão nunca receber nada. O mesmo evento
     * carrega enquete, edição e comentário; só `reaction` interessa aqui.
     *
     * `targetMessageId` é o id da mensagem reagida (o `externoId` que a
     * plataforma guarda), e `key.fromMe` diz se ela saiu daqui.
     */
    cliente.on('message_addon', async (evento: any) => {
      if (evento?.kind !== 'reaction') return;

      const chave = evento?.key ?? {};
      const jid = String(chave.remoteJid ?? '');
      const alvo = String(evento?.targetMessageId ?? '');
      // Todo addon de reação que chega fica no log. Este caminho já se provou
      // difícil de enxergar: a versão anterior escutava o evento errado e o
      // sintoma era simplesmente "nada acontece".
      console.log(
        `Reação recebida: jid=${jid} alvo=${alvo} fromMe=${Boolean(chave.fromMe)} emoji=${
          evento?.decrypted?.reaction?.text ?? '(vazio)'
        }`,
      );

      if (!this.handlerReacao) return;
      if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) {
        return;
      }
      // Reação do próprio vendedor, feita no celular dele: já chega pela tela
      // quando parte daqui, e registrar as duas duplicaria o emoji.
      if (chave.fromMe) return;
      if (!alvo) return;

      await this.handlerReacao({
        sessaoId,
        empresaId: this.empresas.get(sessaoId) ?? '',
        jid,
        alvoExternoId: alvo,
        alvoNosso: Boolean(evento?.decrypted?.reaction?.key?.fromMe),
        // Vazio é remoção — o cliente desfez a reação.
        emoji: String(evento?.decrypted?.reaction?.text ?? ''),
      });
    });

    /**
     * Recibo de mensagem nossa: o aparelho do cliente recebeu, ou ele abriu a
     * conversa e leu.
     *
     * Vem por evento próprio (`receipt`), não pelo `message`. Sem escutá-lo, o
     * `statusEntrega` fica em `enviada` desde o envio e a bolha mostra um
     * risco só para sempre — o vendedor nunca sabe se a mensagem chegou.
     *
     * `messageIds` é uma **lista**: quando o cliente abre a conversa, o
     * WhatsApp confirma num recibo só tudo o que estava por ler.
     */
    cliente.on('receipt', async (evento: any) => {
      // `fromSelfDevice` é o próprio vendedor lendo no celular dele — fala das
      // mensagens que ele **recebeu**, não das que mandou. Marcar a conversa
      // como lida por aqui é outro assunto (ver o plano); confundir os dois
      // faria a mensagem do vendedor virar "lida pelo cliente" sozinha.
      if (evento?.fromSelfDevice) return;

      const status =
        evento?.status === 'read' || evento?.status === 'played'
          ? ('lida' as const)
          : evento?.status === 'delivered'
            ? ('entregue' as const)
            : null;
      // `inactive` e o que a lib venha a acrescentar não dizem nada sobre
      // entrega — ignorar é melhor do que adivinhar.
      if (!status) return;

      const jid = String(evento?.chatJid ?? '');
      const ids = (evento?.messageIds ?? [])
        .map((id: unknown) => String(id))
        .filter(Boolean);
      if (!jid || ids.length === 0) return;
      if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;

      if (!this.handlerRecibo) return;
      await this.handlerRecibo({
        sessaoId,
        empresaId: this.empresas.get(sessaoId) ?? '',
        jid,
        externoIds: ids,
        status,
      });
    });

    this.clientes.set(sessaoId, cliente);

    // Sem `await`: no primeiro pareamento o `connect()` só resolve quando o
    // celular lê o QR, e a rota que chamou isto não pode ficar pendurada até
    // lá. O que der errado vira estado, que é onde a tela olha.
    void cliente.connect().catch((erro: unknown) => {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.definirEstado(sessaoId, {
        status: 'desconectada',
        qr: null,
        numero: null,
        erro: motivo,
      });
      this.clientes.delete(sessaoId);
    });
  }

  /**
   * Puxa agenda e lista de conversas do celular para o store.
   *
   * É um *round* de app-state sync. Duas coisas que custaram tempo para
   * descobrir e não estão na documentação:
   *
   * 1. **Não acontece sozinho ao conectar** — sem esta chamada explícita, a
   *    agenda nunca chega e a tela fica sem contato para vincular.
   * 2. O que o servidor manda é o **delta** desde a versão guardada. Como as
   *    tabelas de agenda passaram a existir depois do primeiro pareamento, o
   *    que já tinha sido sincronizado não volta a ser enviado: nesse caso é
   *    preciso zerar as versões (ver `ressincronizarAgenda`).
   */
  async sincronizarAgenda(sessaoId: string): Promise<void> {
    const cliente = this.clientes.get(sessaoId) as any;
    if (!cliente) throw new Error(`Sessão ${sessaoId} não está conectada neste worker`);
    await cliente.chat.sync();
  }

  /**
   * Refaz a agenda do zero.
   *
   * Apaga as versões de app-state da sessão para que o próximo round venha
   * como snapshot completo em vez de delta. É acoplamento ao schema interno
   * da biblioteca — assumido aqui de propósito: `transport/` é a camada que
   * já conhece o Zapo, e nada fora dela toca nessas tabelas.
   */
  async ressincronizarAgenda(sessaoId: string): Promise<void> {
    const pg = this.pgStore();
    await pg.pool.query(
      `DELETE FROM ${this.tabela('appstate_collection_versions')} WHERE session_id = $1`,
      [sessaoId],
    );
    await this.sincronizarAgenda(sessaoId);
  }

  /**
   * Entrega à API o que o aparelho já tinha, dentro da janela de dias.
   *
   * De onde sai o material: o lote que o WhatsApp despeja no pareamento
   * (history sync) fica no arquivo de mensagens do store — que só existe para
   * a sessão iniciada com `arquivarMensagens`. Não há chamada ao servidor do
   * WhatsApp aqui; é releitura do que já chegou.
   *
   * **Responde antes de terminar.** Importar meses de conversa leva minutos, e
   * a API espera dez segundos por uma resposta do worker: o que volta é o
   * tamanho do trabalho, e o resultado aparece nas conversas da tela conforme
   * cada mensagem é aceita. Quem decide o que vira registro é a API, com a
   * mesma regra do tempo real — contato sem cliente vinculado não é gravado.
   *
   * Reprocessar é seguro: a gravação é upsert pelo `externoId`, então rodar de
   * novo não duplica nada.
   */
  async importarHistorico(
    sessaoId: string,
    dias: number,
  ): Promise<{ encontradas: number; conversas: number }> {
    if (!this.handler) throw new Error('Sem handler de mensagem registrado');
    if (!this.arquivam.has(sessaoId)) {
      throw new Error(
        'Esta sessão não arquiva mensagens. Configure os dias de histórico e reconecte a instância.',
      );
    }
    const corte = Date.now() - dias * 24 * 60 * 60 * 1000;

    const { rows } = await this.pgStore().pool.query(
      `SELECT message_id, thread_jid, from_me, timestamp_ms, message_bytes
         FROM ${this.tabela('mailbox_messages')}
        WHERE session_id = $1
          AND timestamp_ms >= $2
          AND thread_jid NOT LIKE '%@g.us'
          AND thread_jid NOT LIKE '%@broadcast'
          AND thread_jid NOT LIKE '%@newsletter'
        ORDER BY timestamp_ms ASC
        LIMIT ${LIMITE_IMPORTACAO}`,
      [sessaoId, corte],
    );

    const conversas = new Set(rows.map((linha: any) => String(linha.thread_jid)));

    // Sem `await`: ver o comentário acima sobre responder antes de terminar.
    void this.entregarHistorico(sessaoId, rows).catch((erro: unknown) =>
      console.error(`Falha ao importar histórico da sessão ${sessaoId}`, erro),
    );

    return { encontradas: rows.length, conversas: conversas.size };
  }

  /**
   * O laço da importação, um a um e em ordem cronológica.
   *
   * Sequencial de propósito: cada mensagem vira uma chamada HTTP para a API,
   * que grava e pode baixar mídia. Disparar milhares em paralelo derrubaria a
   * API por conta de um botão de administração.
   */
  private async entregarHistorico(sessaoId: string, linhas: any[]) {
    const cliente = this.clientes.get(sessaoId) as any;
    let entregues = 0;

    for (const linha of linhas) {
      try {
        const bytes = linha.message_bytes;
        if (!bytes) continue;
        const mensagem = proto.Message.decode(new Uint8Array(bytes));
        // Reação e afins voltam por outro caminho no tempo real; no histórico
        // não há como pendurá-las com segurança, então ficam de fora.
        if (this.ehReacao(mensagem)) continue;

        const conteudo = this.interpretar(mensagem);
        if (conteudo.tipo === 'outro' && !conteudo.texto) continue;

        const jid = String(linha.thread_jid);
        const minha = Boolean(linha.from_me);
        // O evento que a biblioteca espera para baixar mídia. Link de mídia
        // antiga costuma ter expirado no servidor do WhatsApp — quando expira,
        // a mensagem entra sem o arquivo, que é melhor do que não entrar.
        const evento = {
          key: { id: String(linha.message_id), remoteJid: jid, fromMe: minha },
          message: mensagem,
        };

        await this.handler!(
          {
            sessaoId,
            empresaId: this.empresas.get(sessaoId) ?? '',
            externoId: String(linha.message_id),
            jid,
            telefone: await this.telefoneDoJid(sessaoId, jid),
            nomeExibicao: null,
            minha,
            texto: conteudo.texto,
            tipo: conteudo.tipo,
            arquivoNome: conteudo.arquivoNome,
            arquivoMime: conteudo.arquivoMime,
            respondeuA: conteudo.respondeuA,
            criadaEm: new Date(Number(linha.timestamp_ms)),
          },
          async () =>
            Buffer.from(await cliente.message.downloadBytes(evento)),
        );
        entregues += 1;
      } catch (erro) {
        // Uma mensagem ilegível não pode parar a importação das outras.
        console.error(
          `Histórico: mensagem ${linha?.message_id} descartada`,
          erro,
        );
      }
    }

    console.log(
      `Histórico da sessão ${sessaoId}: ${entregues} de ${linhas.length} mensagens entregues à API`,
    );
  }

  /** Nome da tabela do store, com o prefixo configurado. */
  private tabela(nome: string): string {
    return `"${PREFIXO_TABELAS}${nome}"`;
  }

  /**
   * Agenda do aparelho.
   *
   * Lida por SQL na tabela do store porque a interface pública da biblioteca
   * só sabe buscar contato por jid — não listar. O acoplamento fica contido
   * aqui, que é a camada que já depende do Zapo.
   *
   * Grupos ficam de fora (`@g.us`): a lista serve para vincular contato a
   * cliente, e grupo não é cliente. Pelo mesmo motivo saem o feed de status,
   * as listas de transmissão e os canais — ver `JID_NAO_ATENDIMENTO`.
   */
  async listarContatos(sessaoId: string, busca?: string): Promise<ContatoAgenda[]> {
    const termo = (busca ?? '').trim();
    const filtro = termo
      ? `AND (coalesce(display_name, '') ILIKE $2 OR coalesce(push_name, '') ILIKE $2 OR coalesce(phone_number, '') ILIKE $2)`
      : '';
    const { rows } = await this.pgStore().pool.query(
      `SELECT jid, display_name, push_name, phone_number
         FROM ${this.tabela('mailbox_contacts')}
        WHERE session_id = $1
          AND jid NOT LIKE '%@g.us'
          AND jid NOT LIKE '%@broadcast'
          AND jid NOT LIKE '%@newsletter'
          ${filtro}
        ORDER BY coalesce(display_name, push_name, phone_number, jid)
        LIMIT 500`,
      termo ? [sessaoId, `%${termo}%`] : [sessaoId],
    );
    return rows.map((linha: any) => ({
      jid: linha.jid,
      nome: linha.display_name ?? linha.push_name ?? null,
      // O store guarda o telefone como jid (`5567...@s.whatsapp.net`); a tela
      // e o casamento com o cadastro querem só os dígitos.
      telefone: this.somenteDigitos(linha.phone_number ?? linha.jid),
    }));
  }

  async obterFotoContato(sessaoId: string, jid: string): Promise<FotoContato | null> {
    const cliente = this.clientes.get(sessaoId);
    if (!cliente) throw new Error('Sessão não iniciada');
    try {
      const perfil = await cliente.profile.getProfilePicture(jid, 'image');
      if (!perfil.url) return null;
      const resposta = await fetch(perfil.url, { signal: AbortSignal.timeout(10_000) });
      if (!resposta.ok) return null;
      const conteudo = Buffer.from(await resposta.arrayBuffer());
      if (conteudo.length === 0 || conteudo.length > 5 * 1024 * 1024) return null;
      return {
        conteudoBase64: conteudo.toString('base64'),
        mime: resposta.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg',
      };
    } catch {
      // Privacidade, bloqueio ou ausência de foto são estados normais.
      return null;
    }
  }

  /** Conversas que já existem no aparelho, mesmo sem mensagem nova por aqui. */
  async listarConversas(sessaoId: string, limite = 100): Promise<ConversaAparelho[]> {
    const { rows } = await this.pgStore().pool.query(
      `SELECT t.jid,
              coalesce(t.name, c.display_name, c.push_name) AS nome,
              t.unread_count,
              t.archived,
              coalesce(c.phone_number, t.jid) AS telefone
         FROM ${this.tabela('mailbox_threads')} t
         LEFT JOIN ${this.tabela('mailbox_contacts')} c
                ON c.session_id = t.session_id AND c.jid = t.jid
        WHERE t.session_id = $1
          AND t.jid NOT LIKE '%@g.us'
          AND t.jid NOT LIKE '%@broadcast'
          AND t.jid NOT LIKE '%@newsletter'
          AND coalesce(t.archived, false) = false
        ORDER BY coalesce(t.pinned, 0) DESC, nome
        LIMIT $2`,
      [sessaoId, limite],
    );
    return rows.map((linha: any) => ({
      jid: linha.jid,
      nome: linha.nome ?? null,
      telefone: this.somenteDigitos(linha.telefone),
      naoLidas: Number(linha.unread_count ?? 0),
    }));
  }

  /**
   * Número de telefone por trás do jid.
   *
   * No formato clássico (`5567...@s.whatsapp.net`) ele está no próprio jid.
   * No formato novo (`...@lid`) o jid é opaco e o número só existe na agenda
   * — daí a consulta. Contato fora da agenda simplesmente não tem número
   * conhecido, e o vínculo com o cadastro fica para o vendedor fazer à mão.
   */
  private async telefoneDoJid(sessaoId: string, jid: string): Promise<string | null> {
    if (!jid) return null;
    if (!jid.includes('@lid')) return this.somenteDigitos(jid);
    try {
      const { rows } = await this.pgStore().pool.query(
        `SELECT phone_number FROM ${this.tabela('mailbox_contacts')}
          WHERE session_id = $1 AND jid = $2 LIMIT 1`,
        [sessaoId, jid],
      );
      return this.somenteDigitos(rows[0]?.phone_number ?? null);
    } catch {
      // Agenda indisponível não pode fazer a mensagem se perder.
      return null;
    }
  }

  private somenteDigitos(valor: string | null): string | null {
    if (!valor) return null;
    const digitos = valor.split('@')[0].split(':')[0].replace(/\D/g, '');
    return digitos || null;
  }

  /** `5567999998888:12@s.whatsapp.net` → `5567999998888`. */
  private numeroDe(cliente: WaClient): string | null {
    const jid = (cliente as any).getCredentials?.()?.meJid as string | undefined;
    return jid ? jid.split(/[:@]/)[0] : null;
  }

  /**
   * Socket fechado. Duas famílias de queda, com tratamentos opostos:
   *
   * - **credencial morta** (aparelho removido no celular, logout forçado,
   *   banimento): reconectar não resolve e ainda insiste com o servidor do
   *   WhatsApp. O caminho é avisar o vendedor para reparear.
   * - **queda de rede**: reconectar com backoff, que é o caso comum.
   */
  private tratarQueda(sessaoId: string, evento: any) {
    const motivo = String(evento?.reason ?? '');
    const encerrada = Boolean(evento?.isLogout) || motivo in MOTIVOS_SEM_RECONEXAO;

    // Fechamento que nós mesmos pedimos não é queda.
    if (motivo === 'client_disconnected') return;

    if (motivo === 'failure_banned') {
      this.encerrarCliente(sessaoId);
      this.definirEstado(sessaoId, {
        status: 'banida',
        qr: null,
        numero: null,
        erro:
          'O WhatsApp bloqueou este número. Não adianta reconectar — ver o ' +
          'runbook antes de tentar outro aparelho.',
      });
      return;
    }

    if (encerrada) {
      this.encerrarCliente(sessaoId);
      this.definirEstado(sessaoId, {
        status: 'desconectada',
        qr: null,
        numero: null,
        erro:
          MOTIVOS_SEM_RECONEXAO[motivo] ??
          'A sessão foi encerrada pelo WhatsApp. Leia o QR de novo para voltar a atender.',
      });
      return;
    }

    this.agendarReconexao(sessaoId, motivo);
  }

  private agendarReconexao(sessaoId: string, motivo: string) {
    const tentativa = (this.tentativas.get(sessaoId) ?? 0) + 1;

    if (tentativa > RECONEXAO_MAX_TENTATIVAS) {
      this.encerrarCliente(sessaoId);
      this.definirEstado(sessaoId, {
        status: 'desconectada',
        qr: null,
        numero: null,
        erro:
          `Não foi possível reconectar (${motivo}). Clique em conectar para ` +
          'tentar de novo.',
      });
      return;
    }

    this.tentativas.set(sessaoId, tentativa);
    const espera = Math.min(
      RECONEXAO_ESPERA_INICIAL_MS * 2 ** (tentativa - 1),
      RECONEXAO_ESPERA_MAXIMA_MS,
    );

    this.definirEstado(sessaoId, {
      status: 'desconectada',
      qr: null,
      numero: this.estados.get(sessaoId)?.numero ?? null,
      erro: `Conexão caiu (${motivo}). Reconectando em ${Math.round(espera / 1000)}s…`,
    });

    const timer = setTimeout(() => {
      this.reconexoes.delete(sessaoId);
      void this.reconectar(sessaoId);
    }, espera);
    // O worker não deve ficar de pé só por causa de um timer de reconexão.
    timer.unref?.();
    this.reconexoes.set(sessaoId, timer);
  }

  /**
   * Reabre o socket do mesmo cliente — é o que a biblioteca manda fazer, e
   * preserva a credencial já pareada.
   */
  private async reconectar(sessaoId: string): Promise<void> {
    const cliente = this.clientes.get(sessaoId);
    if (!cliente) return;
    try {
      await cliente.connect();
      this.tentativas.delete(sessaoId);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.agendarReconexao(sessaoId, motivo);
    }
  }

  /** Derruba o cliente e cancela o que estiver agendado para ele. */
  private encerrarCliente(sessaoId: string) {
    const agendada = this.reconexoes.get(sessaoId);
    if (agendada) clearTimeout(agendada);
    this.reconexoes.delete(sessaoId);
    this.tentativas.delete(sessaoId);

    const cliente = this.clientes.get(sessaoId) as
      | (WaClient & { disconnect?: () => Promise<void>; close?: () => Promise<void> })
      | undefined;
    if (cliente) {
      void (cliente.disconnect?.() ?? cliente.close?.() ?? Promise.resolve()).catch(
        () => undefined,
      );
      this.clientes.delete(sessaoId);
    }
    this.limpezas.get(sessaoId)?.stop();
    this.limpezas.delete(sessaoId);
  }

  async desconectar(sessaoId: string): Promise<void> {
    this.encerrarCliente(sessaoId);
    this.definirEstado(sessaoId, {
      status: 'desconectada',
      qr: null,
      numero: null,
      erro: null,
    });
  }

  async enviarTexto(
    sessaoId: string,
    jid: string,
    texto: string,
    respondeuA?: string | null,
  ) {
    const cliente = this.clienteConectado(sessaoId);
    const enviado: any = await (cliente as any).message.send(jid, {
      type: 'text',
      text: texto,
      ...(respondeuA ? { contextInfo: this.citacao(jid, respondeuA) } : {}),
    });
    return { externoId: this.idDoEnvio(enviado) };
  }

  async enviarArquivo(sessaoId: string, jid: string, arquivo: ArquivoParaEnviar) {
    const cliente = this.clienteConectado(sessaoId);
    const tipo = ({
      imagem: 'image',
      video: 'video',
      audio: 'audio',
      documento: 'document',
    } as const)[arquivo.tipo];

    const enviado: any = await (cliente as any).message.send(jid, {
      type: tipo,
      media: arquivo.conteudo,
      mimetype: arquivo.mime,
      ...(arquivo.legenda ? { caption: arquivo.legenda } : {}),
      // O nome só aparece em documento; nos demais o WhatsApp mostra a mídia.
      ...(tipo === 'document' ? { fileName: arquivo.nome } : {}),
      // `ptt` é o que faz o áudio virar mensagem de voz em vez de anexo.
      ...(tipo === 'audio' && arquivo.ptt ? { ptt: true } : {}),
    });
    return { externoId: this.idDoEnvio(enviado) };
  }

  async marcarLida(sessaoId: string, jid: string, externoId: string) {
    const cliente = this.clienteConectado(sessaoId);
    // Best-effort: o recibo de leitura é cortesia com o cliente, não pode
    // fazer a operação da tela falhar.
    await (cliente as any).message
      .sendReceipt(jid, externoId, { type: 'read' })
      .catch(() => undefined);
  }

  /**
   * Reage a uma mensagem (ou desfaz, com `emoji` vazio).
   *
   * Diferente do envio de texto, aqui **não** há um id novo a devolver: a
   * reação não é uma mensagem no rolo, e o provedor a trata como alteração da
   * mensagem alvo.
   */
  async reagir(
    sessaoId: string,
    jid: string,
    alvo: { externoId: string; nosso: boolean },
    emoji: string,
  ) {
    const cliente = this.clienteConectado(sessaoId);
    await (cliente as any).message.send(jid, {
      type: 'reaction',
      emoji,
      target: {
        remoteJid: jid,
        id: alvo.externoId,
        fromMe: alvo.nosso,
      },
    });
  }

  private clienteConectado(sessaoId: string): WaClient {
    const cliente = this.clientes.get(sessaoId);
    if (!cliente) {
      throw new Error(`Sessão ${sessaoId} não está conectada neste worker`);
    }
    return cliente;
  }

  private citacao(jid: string, externoId: string) {
    return { quoted: { key: { remoteJid: jid, fromMe: false, id: externoId } } };
  }

  private idDoEnvio(enviado: any): string {
    return String(enviado?.key?.id ?? enviado?.id ?? Date.now());
  }
}
