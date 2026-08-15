import { ConsoleLogger, createStore, WaClient } from 'zapo-js';
import { createPostgresStore } from '@zapo-js/store-postgres';
import type {
  EstadoPareamento,
  EstadoSessao,
  MensagemRecebida,
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
        // A biblioteca não separa por schema; o prefixo é o que evita colidir
        // com as tabelas de negócio no mesmo banco.
        tablePrefix: process.env.WHATSAPP_STORE_PREFIX ?? 'wa_',
      });
    }
    return this.pg;
  }
  private handler: ((msg: MensagemRecebida) => Promise<void>) | null = null;
  private observador: ((estado: EstadoSessao) => Promise<void>) | null = null;

  constructor(private readonly databaseUrl: string) {}

  aoReceber(handler: (msg: MensagemRecebida) => Promise<void>) {
    this.handler = handler;
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

  async iniciar(sessaoId: string, empresaId: string): Promise<void> {
    this.empresas.set(sessaoId, empresaId);
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
        // O **conteúdo** das mensagens continua fora. É a linha que separa
        // "saber que existe uma conversa" de "guardar o que foi dito": sem
        // isto, a conversa do vendedor com a família dele ficaria arquivada
        // aqui, por baixo da regra de só gravar contato vinculado a cliente.
        //
        // Mensagem de contato já vinculado é gravada pela API em
        // `whatsapp_mensagens`, no instante em que chega.
        messages: 'none',
      },
    });

    const cliente = new WaClient(
      { store, sessionId: sessaoId },
      new ConsoleLogger('info'),
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
        return;
      }
      if (evento?.status === 'close') {
        this.tratarQueda(sessaoId, evento);
      }
    });

    cliente.on('message', async (evento: any) => {
      if (!this.handler) return;
      const chave = evento?.key ?? {};
      // Mensagem que o próprio vendedor mandou pelo celular volta como evento;
      // ela é registrada como saída, não como entrada do cliente.
      if (chave.fromMe) return;
      await this.handler({
        sessaoId,
        empresaId: this.empresas.get(sessaoId) ?? '',
        externoId: String(chave.id ?? ''),
        jid: String(chave.remoteJid ?? ''),
        nomeExibicao: evento?.pushName ?? null,
        texto:
          evento?.message?.conversation ??
          evento?.message?.extendedTextMessage?.text ??
          null,
        tipo: evento?.message?.conversation ? 'texto' : 'outro',
        criadaEm: new Date(),
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

  async enviarTexto(sessaoId: string, jid: string, texto: string) {
    const cliente = this.clientes.get(sessaoId);
    if (!cliente) {
      throw new Error(`Sessão ${sessaoId} não está conectada neste worker`);
    }
    const enviado: any = await (cliente as any).message.send(jid, texto);
    return { externoId: String(enviado?.key?.id ?? enviado?.id ?? Date.now()) };
  }
}
