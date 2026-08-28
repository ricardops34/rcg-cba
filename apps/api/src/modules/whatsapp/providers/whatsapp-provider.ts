import type { WhatsappTransporte } from '@plataforma/contracts';

/**
 * O contrato que isola o resto do módulo de **qual** WhatsApp está do outro
 * lado.
 *
 * Ele já existia uma camada abaixo, dentro do worker
 * (`apps/whatsapp-worker/src/transport/whatsapp-transport.ts`), e resolvia a
 * troca de biblioteca. Não resolve a troca de **provedor**: a Evolution GO não
 * é uma biblioteca que o worker carrega, é um serviço que mantém as próprias
 * sessões — ela substitui o worker, não a `zapo-js` dentro dele. Por isso a
 * abstração sobe para a API, que é onde a decisão "quem fala pelo WhatsApp
 * desta empresa" realmente mora.
 *
 * O que **não** desce para o provedor, e é o ponto: regra de vínculo com
 * cliente, privacidade, RBAC, escopo de carteira, retenção e persistência
 * comercial continuam na API. O provedor transporta mensagem; ele não decide o
 * que é gravado.
 */

/**
 * Tudo que uma operação precisa saber sobre a sessão e o provedor dela,
 * resolvido de uma vez.
 *
 * Vem montado pelo `WhatsappProviderService` porque os segredos chegam
 * cifrados do banco: nenhum provedor decifra nada por conta própria, e nenhum
 * call site precisa saber que existe cifra no caminho.
 */
export interface ContextoSessao {
  empresaId: string;
  sessaoId: string;
  vendedorId: string;
  /**
   * O transporte da **sessão**, não o da empresa.
   *
   * A empresa escolhe um provedor de cada vez, mas a linha da sessão guarda
   * com qual ela foi conectada. Sem isso, trocar o padrão da empresa faria a
   * API falar Evolution com uma instância que ainda vive no worker do zapo —
   * e o erro apareceria como "mensagem não enviada", sem dizer por quê.
   */
  transporte: WhatsappTransporte;
  config: {
    workerUrl: string | null;
    evolutionUrl: string | null;
    /** Já decifrada. Nunca sai da API nem entra em log. */
    evolutionApiKey: string | null;
    historicoDias: number;
  };
  /** Preenchida só nas sessões da Evolution GO. */
  instancia: {
    nome: string | null;
    id: string | null;
    /** Já decifrado. */
    token: string | null;
    /** Já decifrado — é o que autentica a Evolution chamando a API de volta. */
    webhookSegredo: string | null;
  };
}

/**
 * O que o provedor devolve quando cria ou recria a instância do vendedor.
 *
 * Quem grava é o `WhatsappSessaoService`, não o provedor: a escrita passa por
 * RLS e por auditoria (`updatedBy`), e nenhum provedor tem — nem deve ter —
 * acesso ao Prisma.
 */
export interface DadosInstancia {
  nome: string;
  id: string | null;
  token: string | null;
  webhookSegredo: string | null;
}

export interface EstadoPareamento {
  status: 'desconectada' | 'pareando' | 'conectada' | 'banida';
  /** Conteúdo do QR a renderizar. Expira em segundos — sempre lido na hora. */
  qr: string | null;
  numero: string | null;
  erro: string | null;
}

/** Contato como o aparelho o conhece, antes de qualquer vínculo com cliente. */
export interface ContatoAparelho {
  jid: string;
  nome: string | null;
  /** Só dígitos — é assim que o casamento com `clientes` compara. */
  telefone: string | null;
  naoLidas?: number;
}

export interface FotoContato {
  conteudoBase64: string;
  mime: string;
}

export interface ArquivoParaEnviar {
  nome: string;
  mime: string;
  tipo: 'imagem' | 'video' | 'audio' | 'documento';
  conteudoBase64: string;
  legenda?: string | null;
  /** Áudio gravado na hora: vira mensagem de voz, não anexo. */
  ptt?: boolean;
}

export interface WhatsappProvider {
  readonly transporte: WhatsappTransporte;

  /**
   * Sobe a sessão: cria a instância se ainda não existir, reconecta se já
   * existir credencial. **Não espera o pareamento terminar** — o QR chega
   * depois, por `pareamento()`, e segurar a resposta HTTP até o vendedor ler o
   * código a deixaria pendurada por minutos.
   */
  iniciar(
    ctx: ContextoSessao,
    opcoes: { arquivarMensagens: boolean },
  ): Promise<DadosInstancia | null>;

  pareamento(ctx: ContextoSessao): Promise<EstadoPareamento>;

  /** Interrompe a conexão preservando a credencial — dá para reconectar. */
  desconectar(ctx: ContextoSessao): Promise<void>;

  /**
   * Encerra a sessão **no WhatsApp**: o aparelho deixa de aparecer em
   * "Aparelhos conectados" e o próximo uso exige novo QR.
   *
   * Distinto de `desconectar` de propósito. Os dois viravam a mesma coisa no
   * zapo (a biblioteca não separa), mas na Evolution GO são operações
   * diferentes, e tratá-las como sinônimo faria "remover a conexão" apagar uma
   * credencial que a administração só queria pausar.
   */
  sairDoWhatsapp(ctx: ContextoSessao): Promise<void>;

  /**
   * Sai do WhatsApp **e** descarta a instância no provedor.
   *
   * É o que a exclusão de instância chama: deixar a instância órfã no gateway
   * a manteria com a credencial do WhatsApp do vendedor.
   */
  removerInstancia(ctx: ContextoSessao): Promise<void>;

  enviarTexto(
    ctx: ContextoSessao,
    dados: { jid: string; texto: string; respondeuA?: string | null },
  ): Promise<{ externoId: string }>;

  enviarArquivo(
    ctx: ContextoSessao,
    dados: { jid: string; arquivo: ArquivoParaEnviar },
  ): Promise<{ externoId: string }>;

  marcarLida(
    ctx: ContextoSessao,
    dados: { jid: string; externoId: string },
  ): Promise<void>;

  /** `emoji` vazio remove a reação — mesma convenção do WhatsApp. */
  reagir(
    ctx: ContextoSessao,
    dados: {
      jid: string;
      alvoExternoId: string;
      alvoNosso: boolean;
      emoji: string;
    },
  ): Promise<void>;

  listarContatos(
    ctx: ContextoSessao,
    busca?: string,
  ): Promise<ContatoAparelho[]>;

  listarConversas(ctx: ContextoSessao): Promise<ContatoAparelho[]>;

  obterFotoContato(
    ctx: ContextoSessao,
    jid: string,
  ): Promise<FotoContato | null>;

  sincronizarAgenda(ctx: ContextoSessao): Promise<void>;

  importarHistorico(
    ctx: ContextoSessao,
    dias: number,
  ): Promise<{ encontradas: number; conversas: number }>;
}
