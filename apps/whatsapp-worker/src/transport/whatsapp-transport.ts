/**
 * A interface que isola o resto do sistema da biblioteca de WhatsApp.
 *
 * É o ponto mais importante do desenho, e não por elegância: bibliotecas não
 * oficiais de WhatsApp quebram ou morrem — o próprio Zapo corrigiu sete bugs de
 * protocolo em dez dias. A troca de biblioteca (ou a migração para a Cloud API
 * oficial) é questão de quando, não de se. Com esta interface, trocar custa um
 * arquivo; sem ela, custa o módulo inteiro.
 *
 * Por isso nada fora de `transport/` importa `zapo-js`.
 */

export interface MensagemRecebida {
  sessaoId: string;
  /**
   * Vem junto porque a API precisa dele **antes** de conseguir consultar
   * qualquer coisa: as tabelas têm RLS por empresa, e sem o tenant no contexto
   * a busca pela própria sessão voltaria vazia.
   */
  empresaId: string;
  externoId: string;
  jid: string;
  /**
   * Só dígitos, resolvido pelo transporte.
   *
   * Existe porque o jid **não** contém o número no formato novo do WhatsApp
   * (`253368761077916@lid` é opaco). Sem isto, o casamento automático com o
   * cadastro de clientes nunca acontece para esses contatos.
   */
  telefone: string | null;
  /**
   * Saiu do aparelho do **vendedor**, não do cliente.
   *
   * Vale para o que ele escreveu no celular com a plataforma aberta ou não, e
   * também para o eco das que a própria plataforma mandou — nesse caso a
   * mensagem já está gravada e o `externoId` faz o upsert não duplicar.
   */
  minha: boolean;
  nomeExibicao: string | null;
  texto: string | null;
  tipo: 'texto' | 'imagem' | 'documento' | 'audio' | 'video' | 'localizacao' | 'contato' | 'outro';
  /** Preenchidos quando a mensagem carrega mídia — o arquivo vem depois. */
  arquivoNome: string | null;
  arquivoMime: string | null;
  /** Id da mensagem citada, quando é resposta a outra. */
  respondeuA: string | null;
  criadaEm: Date;
}

/**
 * Reação (emoji) que chegou do celular.
 *
 * Não é mensagem: não entra no rolo da conversa, e sim gruda na mensagem que
 * ela aponta. Chega pelo mesmo evento `message` do provedor, e sem este
 * caminho separado ela virava uma bolha vazia (`tipo: 'outro'`, sem texto) no
 * histórico do vendedor.
 */
export interface ReacaoRecebida {
  sessaoId: string;
  empresaId: string;
  jid: string;
  /** Id da mensagem reagida — é por ele que a API a encontra. */
  alvoExternoId: string;
  /** A mensagem reagida é nossa (saída)? Determina de que lado veio. */
  alvoNosso: boolean;
  /** Emoji, ou vazio quando o contato **removeu** a reação. */
  emoji: string;
}

/**
 * Recibo de uma mensagem que **saiu daqui**: o destinatário recebeu no
 * aparelho, ou abriu a conversa e leu.
 *
 * É o que move o `statusEntrega` de `enviada` para `entregue` e `lida` — sem
 * este caminho a bolha fica com um risco só para sempre, e o vendedor não sabe
 * se a mensagem chegou.
 */
export interface ReciboRecebido {
  sessaoId: string;
  empresaId: string;
  jid: string;
  /** Ids das mensagens que este recibo confirma (o WhatsApp manda em lote). */
  externoIds: string[];
  /** `entregue` = chegou no aparelho; `lida` = a conversa foi aberta. */
  status: 'entregue' | 'lida';
}

/** Arquivo a enviar, já em memória (o limite do WhatsApp é da ordem de 16 MB). */
export interface ArquivoParaEnviar {
  conteudo: Buffer;
  nome: string;
  mime: string;
  /** Como o WhatsApp deve apresentá-lo — muda o que o celular mostra. */
  tipo: 'imagem' | 'video' | 'audio' | 'documento';
  legenda?: string | null;
  /** Áudio gravado na hora (aparece como mensagem de voz, não como arquivo). */
  ptt?: boolean;
}

export interface EstadoPareamento {
  status: 'desconectada' | 'pareando' | 'conectada' | 'banida';
  qr: string | null;
  numero: string | null;
  erro: string | null;
}

/**
 * O mesmo estado, com o endereço de quem ele é.
 *
 * Existe porque o aviso vai no sentido contrário do resto: aqui é o worker que
 * procura a API, sem ninguém ter perguntado. E a API não consegue nem localizar
 * a sessão sem o tenant — as tabelas têm RLS.
 */
export interface EstadoSessao extends EstadoPareamento {
  sessaoId: string;
  empresaId: string;
}

/**
 * Contato como o aparelho o conhece — antes de existir qualquer vínculo com o
 * cadastro de cliente. É o que permite ao vendedor vincular a partir de quem
 * ele já tem na agenda, sem depender de a pessoa escrever primeiro.
 */
export interface ContatoAgenda {
  jid: string;
  nome: string | null;
  /** Só dígitos — é assim que o casamento com `clientes` compara. */
  telefone: string | null;
}

export interface FotoContato {
  conteudoBase64: string;
  mime: string;
}

/** Conversa que já existe no celular, com ou sem histórico do nosso lado. */
export interface ConversaAparelho extends ContatoAgenda {
  naoLidas: number;
}

export interface WhatsappTransport {
  /**
   * Sobe a sessão. Se já houver credencial gravada, reconecta sem QR.
   *
   * **Não espera a conexão terminar.** No primeiro pareamento, o `connect()`
   * da biblioteca só resolve quando o celular lê o QR — esperar por isso
   * seguraria a resposta HTTP por minutos, e o QR chega por evento de todo
   * jeito. O resultado da conexão aparece em `estado()`.
   */
  iniciar(
    sessaoId: string,
    empresaId: string,
    /**
     * Arquivar o conteúdo das mensagens no store do worker.
     *
     * Só quem vai importar histórico precisa disso, e é a empresa que decide
     * (o campo "Dias de histórico" da configuração). Falso mantém o padrão:
     * o worker sabe que a conversa existe, não o que foi dito nela.
     */
    arquivarMensagens?: boolean,
  ): Promise<void>;
  /** Estado corrente — o QR expira em segundos, então é sempre lido na hora. */
  estado(sessaoId: string): EstadoPareamento;
  desconectar(sessaoId: string): Promise<void>;
  enviarTexto(
    sessaoId: string,
    jid: string,
    texto: string,
    respondeuA?: string | null,
  ): Promise<{ externoId: string }>;
  enviarArquivo(
    sessaoId: string,
    jid: string,
    arquivo: ArquivoParaEnviar,
  ): Promise<{ externoId: string }>;
  /** Marca como lida no celular do vendedor — some o "não lido" de lá também. */
  marcarLida(sessaoId: string, jid: string, externoId: string): Promise<void>;
  /**
   * Reage a uma mensagem da conversa.
   *
   * `emoji` vazio remove a reação — é assim que o próprio WhatsApp modela, e
   * manter a mesma convenção evita uma segunda rota só para desfazer.
   * `alvoNosso` diz se a mensagem reagida saiu daqui (`fromMe`), o que o
   * provedor exige para localizá-la.
   */
  reagir(
    sessaoId: string,
    jid: string,
    alvo: { externoId: string; nosso: boolean },
    emoji: string,
  ): Promise<void>;
  /** Agenda do aparelho, para o vendedor escolher quem vincular a cliente. */
  listarContatos(sessaoId: string, busca?: string): Promise<ContatoAgenda[]>;
  obterFotoContato(sessaoId: string, jid: string): Promise<FotoContato | null>;
  /** Conversas que já existem no celular. */
  listarConversas(sessaoId: string, limite?: number): Promise<ConversaAparelho[]>;
  /**
   * Refaz agenda e conversas do zero. Existe porque o provedor manda apenas o
   * que mudou desde a última sincronização — quando o histórico se perde, só
   * um pedido explícito o traz de volta.
   */
  ressincronizarAgenda(sessaoId: string): Promise<void>;
  /**
   * Entrega à API o histórico que o aparelho já tem, limitado aos últimos
   * `dias`.
   *
   * Só existe material a entregar se a sessão tiver subido com
   * `arquivarMensagens` — é o que faz o store guardar o conteúdo do que o
   * WhatsApp despeja no pareamento.
   *
   * Devolve o **tamanho do trabalho**, não o resultado: a entrega leva minutos
   * e segue em segundo plano. Quantas viram registro é decisão da API.
   */
  importarHistorico(
    sessaoId: string,
    dias: number,
  ): Promise<{ encontradas: number; conversas: number }>;
  /**
   * Registrado uma vez, na subida — vale para todas as sessões.
   *
   * O `baixarMidia` vem separado de propósito: **a mídia só é baixada se a
   * API disser que a mensagem foi gravada.** Conversa de contato não
   * vinculado a cliente não é registrada, e baixar o arquivo dela seria
   * guardar no servidor justamente o que a regra manda não guardar.
   */
  aoReceber(
    handler: (
      msg: MensagemRecebida,
      baixarMidia: () => Promise<Buffer>,
    ) => Promise<void>,
  ): void;
  /** Registrado uma vez, como `aoReceber` — reação não é mensagem. */
  aoReceberReacao(handler: (reacao: ReacaoRecebida) => Promise<void>): void;
  /** Registrado uma vez, como `aoReceber` — recibo de mensagem nossa. */
  aoReceberRecibo(handler: (recibo: ReciboRecebido) => Promise<void>): void;
  /**
   * Avisado a cada mudança de estado — inclusive as que ninguém pediu: queda
   * de conexão, reconexão, aparelho desvinculado no celular, banimento.
   *
   * Sem isto o banco fica com a última coisa que a tela mandou fazer, não com
   * o que de fato está acontecendo, e o vendedor vê "conectado" enquanto
   * nenhuma mensagem chega.
   */
  aoMudarEstado(handler: (estado: EstadoSessao) => Promise<void>): void;
}
