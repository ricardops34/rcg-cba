import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WHATSAPP_TRANSPORTE_ROTULO,
  whatsappTransporteImplementado,
  type WhatsappTransporte,
} from '@plataforma/contracts';
import {
  PrismaService,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import { decifrarSeHouver } from '../whatsapp-cripto';
import { EvolutionGoProvider } from './evolution-go.provider';
import { ZapoProvider } from './zapo.provider';
import { CloudApiProvider } from './cloud-api.provider';
import type {
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
 *
 * Antes desta camada, cada service montava à mão o caminho REST do worker
 * (`/sessoes/:id/mensagens`) e passava `config.workerUrl` adiante — o endereço
 * de um provedor específico atravessava cinco arquivos de regra de negócio.
 * Agora o resto do módulo pede "envie este texto por esta sessão" e não sabe
 * quem atende.
 *
 * **A escolha é da sessão, não da tela.** A empresa configura um transporte de
 * cada vez, mas cada sessão guarda com qual provedor foi conectada: trocar o
 * padrão da empresa não pode fazer a API falar Evolution com uma instância que
 * ainda vive no worker do zapo. O erro disso apareceria como "mensagem não
 * enviada", sem dizer por quê.
 */
@Injectable()
export class WhatsappProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zapo: ZapoProvider,
    private readonly evolution: EvolutionGoProvider,
    private readonly cloudApi: CloudApiProvider,
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
          cloudApiPhoneNumberId: true,
          cloudApiBusinessAccountId: true,
          cloudApiAccessTokenCifrada: true,
          cloudApiAppSecretCifrada: true,
        },
      });

      return { sessao, config };
    };

    const { sessao, config } = tx
      ? await carregar(tx)
      : await this.prisma.withTenant(empresaId, carregar);

    return {
      empresaId,
      sessaoId: sessao.id,
      vendedorId: sessao.vendedorId,
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
  provedor(ctx: ContextoSessao): WhatsappProvider {
    if (!whatsappTransporteImplementado(ctx.transporte)) {
      throw new BadRequestException(
        `O transporte ${WHATSAPP_TRANSPORTE_ROTULO[ctx.transporte] ?? ctx.transporte} ` +
          'ainda não está implementado nesta plataforma.',
      );
    }
    if (ctx.transporte === 'cloud_api') return this.cloudApi;
    return ctx.transporte === 'evolution_go' ? this.evolution : this.zapo;
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
   * Confere que a empresa configurou o que o transporte escolhido exige.
   *
   * Vale a conferência antecipada porque o sintoma da falta é sempre o mesmo
   * (502 na hora de conectar) e nunca diz qual campo ficou vazio.
   */
  exigirConfiguracao(
    transporte: WhatsappTransporte,
    config: {
      workerUrl: string | null;
      evolutionUrl: string | null;
      evolutionApiKeyCifrada: string | null;
      cloudApiPhoneNumberId?: string | null;
      cloudApiBusinessAccountId?: string | null;
      cloudApiAccessTokenCifrada?: string | null;
      cloudApiAppSecretCifrada?: string | null;
    },
  ): void {
    // Primeiro o transporte, depois os campos dele. Na ordem inversa, escolher
    // a API Oficial com o worker em branco reclamaria do endereço do worker —
    // mandando o administrador preencher um campo que não resolveria nada.
    if (!whatsappTransporteImplementado(transporte)) {
      throw new BadRequestException(
        `O transporte ${WHATSAPP_TRANSPORTE_ROTULO[transporte] ?? transporte} ` +
          'ainda não está implementado nesta plataforma.',
      );
    }
    if (transporte === 'zapo' && !config.workerUrl) {
      throw new BadRequestException(
        'Informe o endereço do worker em Administração > WhatsApp > zapo-js antes de conectar.',
      );
    }
    if (transporte === 'evolution_go') {
      if (!config.evolutionUrl) {
        throw new BadRequestException(
          'Informe o endereço da Evolution GO em Administração > WhatsApp > Evolution GO antes de conectar.',
        );
      }
      if (!config.evolutionApiKeyCifrada) {
        throw new BadRequestException(
          'Informe a chave de API da Evolution GO em Administração > WhatsApp > Evolution GO antes de conectar.',
        );
      }
    }
    if (transporte === 'cloud_api') {
      if (!config.cloudApiPhoneNumberId) {
        throw new BadRequestException(
          'Informe o Phone Number ID em Administração > WhatsApp > API Oficial antes de conectar.',
        );
      }
      if (!config.cloudApiBusinessAccountId) {
        throw new BadRequestException(
          'Informe o Business Account ID em Administração > WhatsApp > API Oficial antes de conectar.',
        );
      }
      if (!config.cloudApiAccessTokenCifrada) {
        throw new BadRequestException(
          'Informe o token de acesso em Administração > WhatsApp > API Oficial antes de conectar.',
        );
      }
      if (!config.cloudApiAppSecretCifrada) {
        throw new BadRequestException(
          'Informe o App Secret em Administração > WhatsApp > API Oficial antes de conectar.',
        );
      }
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
    tx?: TenantTx,
  ): Promise<FotoContato | null> {
    const { ctx, provider } = await this.provedorDaSessao(
      empresaId,
      sessaoId,
      tx,
    );
    return provider.obterFotoContato(ctx, jid);
  }

  async sincronizarAgenda(empresaId: string, sessaoId: string): Promise<void> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    await provider.sincronizarAgenda(ctx);
  }

  async importarHistorico(
    empresaId: string,
    sessaoId: string,
    dias: number,
  ): Promise<{ encontradas: number; conversas: number }> {
    const { ctx, provider } = await this.provedorDaSessao(empresaId, sessaoId);
    return provider.importarHistorico(ctx, dias);
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
}
