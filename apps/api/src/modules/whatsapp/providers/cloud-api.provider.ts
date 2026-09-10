import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { WhatsappTransporte } from '@plataforma/contracts';
import { CloudApiClient } from './cloud-api.client';
import type {
  ArquivoParaEnviar,
  ContatoAparelho,
  ContextoSessao,
  DadosInstancia,
  EstadoPareamento,
  FotoContato,
  TemplateSincronizado,
  WhatsappProvider,
} from './whatsapp-provider';

/**
 * Provedor WhatsApp Cloud API (oficial da Meta).
 *
 * A diferença central em relação aos outros dois provedores: aqui não há
 * pareamento nenhum. Não existe WhatsApp Web pareado a um aparelho — o número
 * já está cadastrado no Business Manager, e "conectar" é só validar que o
 * Phone Number ID e o token de acesso são válidos. Por isso `iniciar` e
 * `pareamento` chamam a mesma consulta, e `pareamento` nunca devolve
 * `'pareando'`: não há QR para esperar.
 *
 * Escopo institucional apenas (`docs/planos/whatsapp-api-oficial.md`): quem
 * decide isso é `WhatsappSessaoService`/a tela, não este provider — ele só
 * implementa o contrato como qualquer outro.
 *
 * A janela de 24h (fora dela, só template pré-aprovado sai) **não** é
 * checada aqui: o provider transporta, não decide regra de negócio, e não
 * tem acesso ao Prisma para saber quando foi a última mensagem do cliente. A
 * checagem é de `WhatsappConversasService`, uma camada acima.
 */
@Injectable()
export class CloudApiProvider implements WhatsappProvider {
  readonly transporte: WhatsappTransporte = 'cloud_api';
  private readonly logger = new Logger(CloudApiProvider.name);

  constructor(private readonly http: CloudApiClient) {}

  // ----------------------------------------------------------------------
  // Instância e conexão — sem pareamento
  // ----------------------------------------------------------------------

  private phoneNumberId(ctx: ContextoSessao): string {
    const id = ctx.config.cloudApiPhoneNumberId;
    if (!id) {
      throw new BadGatewayException(
        'A Cloud API não está configurada. Informe o Phone Number ID em ' +
          'Administração > WhatsApp > API Oficial.',
      );
    }
    return id;
  }

  /**
   * Confere a credencial e devolve os dados do número. Serve tanto `iniciar`
   * quanto `pareamento` — é a mesma pergunta ("essa credencial fala por este
   * número?") feita nos dois momentos.
   */
  private async consultarNumero(
    ctx: ContextoSessao,
  ): Promise<{ numero: string | null }> {
    const resposta = await this.http.chamar<{
      display_phone_number?: string;
    }>(
      `/${this.phoneNumberId(ctx)}?fields=display_phone_number,verified_name`,
      { token: ctx.config.cloudApiAccessToken },
    );
    return { numero: resposta.display_phone_number ?? null };
  }

  /**
   * Não há instância para criar — o número já existe no Business Manager.
   * Validar a credencial aqui é o que faz um Phone Number ID ou token
   * errados aparecerem na hora de "conectar", e não silenciosamente no
   * primeiro envio.
   */
  iniciar(): Promise<DadosInstancia | null> {
    return Promise.resolve(null);
  }

  /**
   * Sem QR: sucesso na consulta já é "conectada". Falha (token inválido,
   * Phone Number ID incorreto) é "desconectada" com o motivo — nunca
   * `'pareando'`, que não faz sentido aqui.
   */
  async pareamento(ctx: ContextoSessao): Promise<EstadoPareamento> {
    try {
      const { numero } = await this.consultarNumero(ctx);
      return { status: 'conectada', qr: null, numero, erro: null };
    } catch (erro) {
      return {
        status: 'desconectada',
        qr: null,
        numero: null,
        erro: erro instanceof Error ? erro.message : String(erro),
      };
    }
  }

  /**
   * As três operações abaixo não têm o que fazer: o número continua
   * cadastrado no Business Manager independente do que este sistema faz.
   * Diferente do zapo/Evolution GO, não há sessão local para encerrar — só a
   * configuração da empresa, que a tela apaga separadamente.
   */
  desconectar(): Promise<void> {
    this.logger.debug('Cloud API não mantém conexão para desconectar.');
    return Promise.resolve();
  }

  sairDoWhatsapp(): Promise<void> {
    this.logger.debug(
      'Cloud API não pareia aparelho — nada a encerrar no WhatsApp.',
    );
    return Promise.resolve();
  }

  removerInstancia(): Promise<void> {
    this.logger.debug('Cloud API não tem instância no gateway para remover.');
    return Promise.resolve();
  }

  // ----------------------------------------------------------------------
  // Mensagens
  // ----------------------------------------------------------------------

  async enviarTexto(
    ctx: ContextoSessao,
    dados: { jid: string; texto: string; respondeuA?: string | null },
  ): Promise<{ externoId: string }> {
    const resposta = await this.http.chamar<{
      messages?: { id?: string }[];
    }>(`/${this.phoneNumberId(ctx)}/messages`, {
      metodo: 'POST',
      token: ctx.config.cloudApiAccessToken,
      corpo: {
        messaging_product: 'whatsapp',
        to: this.destinatario(dados.jid),
        type: 'text',
        text: { body: dados.texto },
        ...(dados.respondeuA
          ? { context: { message_id: dados.respondeuA } }
          : {}),
      },
    });
    return { externoId: this.externoId(resposta) };
  }

  /**
   * Upload em duas etapas, ao contrário da Evolution GO (que aceita
   * `data:` URI direto): a Cloud API só referencia mídia por `id`, devolvido
   * por `POST /{phoneNumberId}/media`.
   *
   * `ptt` não tem campo próprio aqui — a Cloud API não distingui "mensagem de
   * voz" de "arquivo de áudio" por uma flag, e sim pelo codec do arquivo
   * (OGG/Opus vira player de voz no WhatsApp do cliente, o resto vira
   * anexo). Documentado, não implementado: recodificar áudio não é
   * responsabilidade deste provider.
   */
  async enviarArquivo(
    ctx: ContextoSessao,
    dados: { jid: string; arquivo: ArquivoParaEnviar },
  ): Promise<{ externoId: string }> {
    const phoneNumberId = this.phoneNumberId(ctx);
    const mediaId = await this.http.enviarMedia(
      phoneNumberId,
      ctx.config.cloudApiAccessToken,
      {
        conteudoBase64: dados.arquivo.conteudoBase64,
        mime: dados.arquivo.mime,
      },
    );

    const tipo = this.tipoExterno(dados.arquivo.tipo);
    const resposta = await this.http.chamar<{
      messages?: { id?: string }[];
    }>(`/${phoneNumberId}/messages`, {
      metodo: 'POST',
      token: ctx.config.cloudApiAccessToken,
      corpo: {
        messaging_product: 'whatsapp',
        to: this.destinatario(dados.jid),
        type: tipo,
        [tipo]: {
          id: mediaId,
          ...(dados.arquivo.legenda && tipo !== 'audio'
            ? { caption: dados.arquivo.legenda }
            : {}),
          ...(tipo === 'document' ? { filename: dados.arquivo.nome } : {}),
        },
      },
    });
    return { externoId: this.externoId(resposta) };
  }

  async marcarLida(
    ctx: ContextoSessao,
    dados: { jid: string; externoId: string },
  ): Promise<void> {
    await this.http.chamar(`/${this.phoneNumberId(ctx)}/messages`, {
      metodo: 'POST',
      token: ctx.config.cloudApiAccessToken,
      corpo: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: dados.externoId,
      },
    });
  }

  /**
   * A Cloud API não tem rota para **mandar** reação — só recebe. Diferente
   * de erro: reagir do lado da empresa simplesmente não existe nesta
   * plataforma oficial, e a mensagem chegaria intacta sem a reação.
   */
  reagir(): Promise<void> {
    this.logger.debug(
      'Cloud API não permite enviar reação — recurso inexistente na Graph API.',
    );
    return Promise.resolve();
  }

  async enviarTemplate(
    ctx: ContextoSessao,
    dados: { jid: string; nome: string; idioma: string; parametros?: string[] },
  ): Promise<{ externoId: string }> {
    const resposta = await this.http.chamar<{
      messages?: { id?: string }[];
    }>(`/${this.phoneNumberId(ctx)}/messages`, {
      metodo: 'POST',
      token: ctx.config.cloudApiAccessToken,
      corpo: {
        messaging_product: 'whatsapp',
        to: this.destinatario(dados.jid),
        type: 'template',
        template: {
          name: dados.nome,
          language: { code: dados.idioma },
          ...(dados.parametros?.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: dados.parametros.map((texto) => ({
                      type: 'text',
                      text: texto,
                    })),
                  },
                ],
              }
            : {}),
        },
      },
    });
    return { externoId: this.externoId(resposta) };
  }

  /**
   * Lista os templates do Business Manager — só a chamada HTTP. Quem grava
   * em `WhatsappTemplate` é `WhatsappConfigService`, não este provider: como
   * os demais, ele não toca Prisma.
   */
  async sincronizarTemplates(
    ctx: ContextoSessao,
  ): Promise<TemplateSincronizado[]> {
    const businessAccountId = ctx.config.cloudApiBusinessAccountId;
    if (!businessAccountId) {
      throw new BadGatewayException(
        'Informe o Business Account ID em Administração > WhatsApp > API Oficial.',
      );
    }
    const resposta = await this.http.chamar<{
      data?: {
        id: string;
        name: string;
        language: string;
        category: string;
        status: string;
        components: unknown;
      }[];
    }>(
      `/${businessAccountId}/message_templates?fields=name,language,category,status,components&limit=200`,
      { token: ctx.config.cloudApiAccessToken },
    );
    return (resposta.data ?? []).map((t) => ({
      metaId: t.id,
      nome: t.name,
      idioma: t.language,
      categoria: t.category,
      status: t.status,
      componentes: t.components,
    }));
  }

  // ----------------------------------------------------------------------
  // Agenda — a Cloud API não expõe nada disso (não existe aparelho)
  // ----------------------------------------------------------------------

  listarContatos(): Promise<ContatoAparelho[]> {
    this.logger.debug('Cloud API não expõe agenda de contatos.');
    return Promise.resolve([]);
  }

  listarConversas(): Promise<ContatoAparelho[]> {
    this.logger.debug('Cloud API não expõe conversas do aparelho.');
    return Promise.resolve([]);
  }

  obterFotoContato(): Promise<FotoContato | null> {
    return Promise.resolve(null);
  }

  sincronizarAgenda(): Promise<void> {
    this.logger.debug('Cloud API não tem agenda de aparelho para sincronizar.');
    return Promise.resolve();
  }

  importarHistorico(): Promise<{
    encontradas: number;
    conversas: number;
  }> {
    this.logger.debug('Cloud API não tem histórico de aparelho para importar.');
    return Promise.resolve({ encontradas: 0, conversas: 0 });
  }

  // ----------------------------------------------------------------------
  // Normalização
  // ----------------------------------------------------------------------

  private externoId(resposta: { messages?: { id?: string }[] }): string {
    const id = resposta.messages?.[0]?.id;
    if (!id) {
      throw new BadGatewayException(
        'A Meta não devolveu o identificador da mensagem enviada.',
      );
    }
    return id;
  }

  private tipoExterno(
    tipo: ArquivoParaEnviar['tipo'],
  ): 'image' | 'video' | 'audio' | 'document' {
    return tipo === 'imagem'
      ? 'image'
      : tipo === 'video'
        ? 'video'
        : tipo === 'audio'
          ? 'audio'
          : 'document';
  }

  /** A Cloud API só aceita o número em dígitos (com DDI), sem `@sufixo`. */
  private destinatario(jid: string): string {
    return jid.split('@')[0].replace(/\D/g, '');
  }
}
