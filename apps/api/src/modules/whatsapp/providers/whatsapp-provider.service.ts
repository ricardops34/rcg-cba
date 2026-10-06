import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WHATSAPP_TRANSPORTE_ROTULO,
  whatsappTransporteImplementado,
  type WhatsappInterativo,
  type WhatsappTransporte,
} from '@plataforma/contracts';
import {
  PrismaService,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import { decifrarSeHouver } from '../whatsapp-cripto';
import { EvolutionGoProvider } from './evolution-go.provider';
import type {
  AncoraHistorico,
  ArquivoParaEnviar,
  ContatoAparelho,
  ContextoSessao,
  DadosInstancia,
  EstadoPareamento,
  FotoContato,
  WhatsappProvider,
} from './whatsapp-provider';

/**
 * Porta única do módulo para o mundo do WhatsApp.
 * Centralizada no Gateway Evolution GO, que suporta integrações Não Oficial e Oficial.
 */
@Injectable()
export class WhatsappProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionGoProvider,
  ) {}

  // ----------------------------------------------------------------------
  // Contexto
  // ----------------------------------------------------------------------

  /**
   * Monta o contexto de uma sessão: provedor, endereços e segredos já
   * decifrados.
   *
   * O `tx` opcional não é conveniência — é o que evita abrir uma segunda
   * transação (e ocupar outra conexão do pool) quando o chamador já está
   * dentro de um `withTenant`, que é o caso de quase todo envio.
   */
  async contexto(
    empresaId: string,
    sessaoId: string,
    tx?: TenantTx,
  ): Promise<ContextoSessao> {
    const carregar = async (t: TenantTx) => {
      const sessao = await t.whatsappSessao.findFirst({
        where: { id: sessaoId },
        select: {
          id: true,
          vendedorId: true,
          vendedor: { select: { nome: true, codigoErp: true } },
          transporte: true,
          instanciaExterna: true,
          instanciaId: true,
          instanciaTokenCifrado: true,
          webhookSegredoCifrado: true,
        },
      });
      if (!sessao)
        throw new NotFoundException('Sessão de WhatsApp não encontrada');

      const config = await t.whatsappConfig.findUnique({
        where: { empresaId },
        select: {
          workerUrl: true,
          evolutionUrl: true,
          evolutionApiKeyCifrada: true,
          historicoDias: true,
          evolutionAlwaysOnline: true,
          evolutionIgnoreGroups: true,
          evolutionIgnoreStatus: true,
          evolutionReadMessages: true,
          evolutionRejectCall: true,
          evolutionMsgRejectCall: true,
          cloudApiPhoneNumberId: true,
          cloudApiBusinessAccountId: true,
          cloudApiAccessTokenCifrada: true,
          cloudApiAppSecretCifrada: true,
        },
      });

      // À parte, e não como relação da sessão: `empresas` tem RLS por grupo, e
      // uma relação obrigatória oculta derrubaria a consulta inteira. O nome
      // só enfeita o rótulo da instância; sem ele, segue sem.
      const empresa = await t.empresa.findFirst({
        where: { id: empresaId },
        select: { nomeFantasia: true },
      });

      return { sessao, config, empresa };
    };

    const { sessao, config, empresa } = tx
      ? await carregar(tx)
      : await this.prisma.withTenant(empresaId, carregar);

    return {
      empresaId,
      sessaoId: sessao.id,
      vendedorId: sessao.vendedorId,
      vendedorNome: sessao.vendedor?.nome ?? null,
      vendedorCodigo: sessao.vendedor?.codigoErp ?? null,
      empresaNome: empresa?.nomeFantasia ?? null,
      // O enum do Prisma e o do contrato são o mesmo conjunto de valores, então
      // não há conversão a fazer aqui.
      transporte: sessao.transporte,
      config: {
        workerUrl: config?.workerUrl ?? null,
        evolutionUrl: config?.evolutionUrl ?? null,
        evolutionApiKey: decifrarSeHouver(
          config?.evolutionApiKeyCifrada ?? null,
        ),
        historicoDias: config?.historicoDias ?? 0,
        // Os defaults repetem os que estavam fixos no codigo: empresa sem
        // linha de configuracao continua com o comportamento de antes.
        evolutionAlwaysOnline: config?.evolutionAlwaysOnline ?? false,
        evolutionIgnoreGroups: config?.evolutionIgnoreGroups ?? true,
        evolutionIgnoreStatus: config?.evolutionIgnoreStatus ?? true,
        evolutionReadMessages: config?.evolutionReadMessages ?? false,
        evolutionRejectCall: config?.evolutionRejectCall ?? false,
        evolutionMsgRejectCall: config?.evolutionMsgRejectCall ?? null,
        cloudApiPhoneNumberId: config?.cloudApiPhoneNumberId ?? null,
        cloudApiBusinessAccountId: config?.cloudApiBusinessAccountId ?? null,
        cloudApiAccessToken: decifrarSeHouver(
          config?.cloudApiAccessTokenCifrada ?? null,
        ),
        cloudApiAppSecret: decifrarSeHouver(
          config?.cloudApiAppSecretCifrada ?? null,
        ),
      },
      instancia: {
        nome: sessao.instanciaExterna,
        id: sessao.instanciaId,
        token: decifrarSeHouver(sessao.instanciaTokenCifrado),
        webhookSegredo: decifrarSeHouver(sessao.webhookSegredoCifrado),
      },
    };
  }

  /** O provedor que atende esta sessão. */
  provedor(_ctx: ContextoSessao): WhatsappProvider {
    return this.evolution;
  }

  /** Atalho para quem só tem os ids em mãos. */
  async provedorDaSessao(
    empresaId: string,
    sessaoId: string,
    tx?: TenantTx,
  ): Promise<{ ctx: ContextoSessao; provider: WhatsappProvider }> {
    const ctx = await this.contexto(empresaId, sessaoId, tx);
    return { ctx, provider: this.provedor(ctx) };
  }

  /**
   * Confere que a empresa configurou o que o Gateway Evolution GO exige.
   */
  exigirConfiguracao(
    _transporte: WhatsappTransporte,
    config: {
      evolutionUrl: string | null;
      evolutionApiKeyCifrada: string | null;
    },
  ): void {
    if (!config.evolutionUrl) {
      throw new BadRequestException(
        'Informe o endereço da Evolution GO em Administração > WhatsApp > Gateway Evolution GO antes de conectar.',
      );
    }
    if (!config.evolutionApiKeyCifrada) {
      throw new BadRequestException(
        'Informe a chave de API da Evolution GO em Administração > WhatsApp > Gateway Evolution GO antes de conectar.',
      );
    }
  }

  // ----------------------------------------------------------------------
  // Delegação
  //
  // Assinaturas por (empresaId, sessaoId) porque é o que os services têm em
  // mãos — a conversa carrega o `sessaoId`, não o contexto. Quem já está numa
  // transação passa o `tx` e evita a segunda conexão.
  // ----------------------------------------------------------------------

  async iniciar(
    empresaId: string,
    sessaoId: string,
    opcoes: { arquivarMensagens: boolean },
    tx?: TenantTx,
  ): Promise<DadosInstancia | null> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.iniciar(ctx, opcoes);
  }

  async pareamento(
    empresaId: string,
    sessaoId: string,
    tx?: TenantTx,
  ): Promise<EstadoPareamento> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.pareamento(ctx);
  }

  async desconectar(
    empresaId: string,
    sessaoId: string,
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    await provider.desconectar(ctx);
  }

  async sairDoWhatsapp(
    empresaId: string,
    sessaoId: string,
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    await provider.sairDoWhatsapp(ctx);
  }

  async removerInstancia(
    empresaId: string,
    sessaoId: string,
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    await provider.removerInstancia(ctx);
  }

  async enviarTexto(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; texto: string; respondeuA?: string | null },
    tx?: TenantTx,
  ): Promise<{ externoId: string }> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.enviarTexto(ctx, dados);
  }

  async enviarArquivo(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; arquivo: ArquivoParaEnviar },
    tx?: TenantTx,
  ): Promise<{ externoId: string }> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.enviarArquivo(ctx, dados);
  }

  async enviarInterativo(
    empresaId: string,
    sessaoId: string,
    dados: {
      jid: string;
      mensagem: WhatsappInterativo;
      respondeuA?: string | null;
    },
    tx?: TenantTx,
  ): Promise<{ externoId: string }> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.enviarInterativo(ctx, dados);
  }

  async editarMensagem(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; externoId: string; texto: string },
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId, tx);
    await provider.editarMensagem(ctx, dados);
  }

  async apagarMensagem(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; externoId: string },
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId, tx);
    await provider.apagarMensagem(ctx, dados);
  }

  async presenca(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; estado: 'digitando' | 'gravando' | 'parou' },
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId, tx);
    await provider.presenca(ctx, dados);
  }

  async resultadosEnquete(
    empresaId: string,
    sessaoId: string,
    enqueteExternoId: string,
  ) {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    return provider.resultadosEnquete(ctx, enqueteExternoId);
  }

  async marcarLida(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; externoId: string },
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    await provider.marcarLida(ctx, dados);
  }

  async reagir(
    empresaId: string,
    sessaoId: string,
    dados: {
      jid: string;
      alvoExternoId: string;
      alvoNosso: boolean;
      emoji: string;
    },
    tx?: TenantTx,
  ): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    await provider.reagir(ctx, dados);
  }

  async listarContatos(
    empresaId: string,
    sessaoId: string,
    busca?: string,
  ): Promise<ContatoAparelho[]> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    return provider.listarContatos(ctx, busca);
  }

  async listarConversas(
    empresaId: string,
    sessaoId: string,
  ): Promise<ContatoAparelho[]> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    return provider.listarConversas(ctx);
  }

  async obterFotoContato(
    empresaId: string,
    sessaoId: string,
    jid: string,
    telefone?: string | null,
    tx?: TenantTx,
  ): Promise<FotoContato | null> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.obterFotoContato(ctx, jid, telefone);
  }

  async sincronizarAgenda(empresaId: string, sessaoId: string): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    await provider.sincronizarAgenda(ctx);
  }

  async importarHistorico(
    empresaId: string,
    sessaoId: string,
    dias: number,
    ancoras: AncoraHistorico[],
  ): Promise<{ encontradas: number; conversas: number }> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    return provider.importarHistorico(ctx, dias, ancoras);
  }

  /**
   * Envio por template — só a Cloud API implementa. Recusar aqui, e não
   * deixar o `undefined` estourar como erro genérico mais adiante, é o que dá
   * uma mensagem que diz o que aconteceu.
   */
  async enviarTemplate(
    empresaId: string,
    sessaoId: string,
    dados: { jid: string; nome: string; idioma: string; parametros?: string[] },
    tx?: TenantTx,
  ): Promise<{ externoId: string }> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    if (!provider.enviarTemplate) {
      throw new BadRequestException(
        `O transporte ${WHATSAPP_TRANSPORTE_ROTULO[ctx.transporte] ?? ctx.transporte} ` +
          'não suporta envio por template.',
      );
    }
    return provider.enviarTemplate(ctx, dados);
  }

  /** Mesma razão de recusa de `enviarTemplate` — só a Cloud API implementa. */
  async sincronizarTemplates(empresaId: string, sessaoId: string) {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    if (!provider.sincronizarTemplates) {
      throw new BadRequestException(
        `O transporte ${WHATSAPP_TRANSPORTE_ROTULO[ctx.transporte] ?? ctx.transporte} ` +
          'não suporta templates.',
      );
    }
    return provider.sincronizarTemplates(ctx);
  }

  /**
   * Testa conectividade com a Evolution GO e valida a chave administrativa (GLOBAL_API_KEY).
   */
  async testarGateway(
    url: string,
    chaveAdmin: string,
  ): Promise<{ ok: boolean; mensagem: string; totalInstancias: number }> {
    return this.evolution.testarGateway(url, chaveAdmin);
  }
}

