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
  nomeExibicao: string | null;
  texto: string | null;
  tipo: 'texto' | 'imagem' | 'documento' | 'audio' | 'video' | 'localizacao' | 'contato' | 'outro';
  criadaEm: Date;
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

export interface WhatsappTransport {
  /**
   * Sobe a sessão. Se já houver credencial gravada, reconecta sem QR.
   *
   * **Não espera a conexão terminar.** No primeiro pareamento, o `connect()`
   * da biblioteca só resolve quando o celular lê o QR — esperar por isso
   * seguraria a resposta HTTP por minutos, e o QR chega por evento de todo
   * jeito. O resultado da conexão aparece em `estado()`.
   */
  iniciar(sessaoId: string, empresaId: string): Promise<void>;
  /** Estado corrente — o QR expira em segundos, então é sempre lido na hora. */
  estado(sessaoId: string): EstadoPareamento;
  desconectar(sessaoId: string): Promise<void>;
  enviarTexto(
    sessaoId: string,
    jid: string,
    texto: string,
  ): Promise<{ externoId: string }>;
  /** Registrado uma vez, na subida — vale para todas as sessões. */
  aoReceber(handler: (msg: MensagemRecebida) => Promise<void>): void;
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
