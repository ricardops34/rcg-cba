import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { cifrarSegredo } from './whatsapp-cripto';
import type { DadosInstancia } from './providers/whatsapp-provider';
import { escopoLeituraWhatsapp } from './escopo-whatsapp';
import { apagarConversas } from './apagar-conversas';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import {
  WHATSAPP_ACEITE_VERSAO,
  WHATSAPP_SESSAO_STATUS,
  type WhatsappConectar,
  type WhatsappConectarEmpresa,
  type WhatsappSessaoStatus,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Sessão de WhatsApp do vendedor.
 *
 * Duas regras de negócio estão codificadas aqui e não são da tela:
 *
 * 1. **Um número por vendedor.** Garantido no banco por
 *    `@@unique([empresaId, vendedorId])`; o serviço nunca cria uma segunda
 *    linha, sempre faz upsert da mesma. Trocar de número exige desconectar
 *    antes — recusar é melhor que derrubar a sessão em uso sem avisar.
 *
 * 2. **A sessão é sempre resolvida pelo usuário logado**, nunca por um id que
 *    venha da requisição. Nenhum vendedor pareia ou derruba o aparelho de
 *    outro, mesmo conhecendo o id.
 *
 * A leitura da equipe (supervisor) é o único caminho que enxerga sessão
 * alheia, e depende de `whatsapp-equipe.visualizar` — ver `escopoLeitura`.
 */
/** Por que a conexão foi recusada — mesma frase na tela e no `ultimoErro`. */
function mensagemNumeroEmUso(numero: string): string {
  return (
    `O número ${numero} já está conectado em outra instância da plataforma. ` +
    'Cada número de WhatsApp só pode estar ligado a um vendedor — ' +
    'desconecte-o lá antes de conectar aqui.'
  );
}

@Injectable()
export class WhatsappSessaoService {
  private readonly logger = new Logger(WhatsappSessaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsappConfigService,
    private readonly provedores: WhatsappProviderService,
  ) {}

  /**
   * Guarda os dados da instância que o provedor acabou de criar.
   *
   * Só a Evolution GO devolve algo aqui — o worker do zapo identifica a sessão
   * pelo próprio id e não tem instância externa. Os dois segredos são cifrados
   * antes de encostar no banco: quem os tem fala pelo WhatsApp do vendedor.
   *
   * Escrita separada da criação da sessão de propósito: a instância só existe
   * depois que o provedor responde, e a linha precisa existir antes para o
   * provedor ter um `sessaoId` com que nomear a instância.
   */
  private async gravarInstancia(
    empresaId: string,
    sessaoId: string,
    dados: DadosInstancia | null,
  ) {
    if (!dados) return;
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.update({
        where: { id: sessaoId },
        data: {
          instanciaExterna: dados.nome,
          instanciaId: dados.id,
          ...(dados.token
            ? { instanciaTokenCifrado: cifrarSegredo(dados.token) }
            : {}),
          ...(dados.webhookSegredo
            ? { webhookSegredoCifrado: cifrarSegredo(dados.webhookSegredo) }
            : {}),
        },
      }),
    );
  }

  /**
   * Vendedor do usuário logado. Sem cadastro de Vendedor não há WhatsApp a
   * conectar — e é um caso real (perfil Administrativo), então a mensagem
   * precisa explicar em vez de estourar 500.
   */
  private async vendedorDoUsuario(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ) {
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true, nome: true },
    });
    if (!vendedor) {
      throw new BadRequestException(
        'Seu usuário não está vinculado a um cadastro de vendedor, então não há ' +
          'WhatsApp para conectar. Peça ao administrador para fazer o vínculo.',
      );
    }
    return vendedor;
  }

  /**
   * Quais vendedores este usuário pode **ler**.
   *
   * A regra mora em `escopoLeituraWhatsapp`, fora do service, porque a
   * listagem de Posição de Cliente também precisa dela — ver o comentário lá.
   * Este método continua existindo para quem já o chama pelo service.
   */
  async escopoLeitura(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    return escopoLeituraWhatsapp(tx, empresaId, user);
  }

  /** Sessão do próprio usuário. Devolve null quando ele nunca conectou. */
  async minha(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
      });
      // Instância conectada por outro usuário (vínculo vendedor × usuário
      // trocado) não é "minha": a tela oferece conectar, e o `conectar` explica.
      if (!sessao || sessao.usuarioId !== user.id) return null;
      return this.paraLeitura(sessao, vendedor.nome);
    });
  }

  /**
   * Inicia o pareamento. O aceite é obrigatório: o vendedor precisa ter lido,
   * por escrito, que a conversa com clientes é gravada e visível ao supervisor.
   */
  async conectar(
    empresaId: string,
    user: AuthenticatedUser,
    input: WhatsappConectar,
  ) {
    const config = await this.config.obter(empresaId);
    if (!config.ativo) {
      throw new BadRequestException(
        'O WhatsApp está desativado para esta empresa. Ative em Administração > WhatsApp.',
      );
    }
    // Antes de criar a linha: o que falta é sempre um campo de configuração, e
    // o sintoma sem esta conferência é um 502 na tela do vendedor que não diz
    // qual campo ficou vazio.
    this.provedores.exigirConfiguracao('evolution_go', config);

    const anterior = await this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const atual = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: {
          id: true,
          status: true,
          numero: true,
          transporte: true,
          usuarioId: true,
        },
      });

      // A instância é de quem a conectou. Com o vínculo vendedor × usuário
      // trocado, o novo usuário não assume um aparelho que ainda está no ar.
      if (
        atual?.status === 'conectada' &&
        atual.usuarioId &&
        atual.usuarioId !== user.id
      ) {
        throw new BadRequestException(
          'A instância deste vendedor está conectada por outro usuário. ' +
            'Peça ao administrador para desconectá-la em Administração > WhatsApp.',
        );
      }

      // Regra 1: um número por vendedor. Já conectado, o caminho é desconectar
      // primeiro — trocar por baixo derrubaria um atendimento em andamento.
      if (atual?.status === 'conectada') {
        throw new BadRequestException(
          `Você já tem o número ${atual.numero ?? ''} conectado. Desconecte antes de parear outro.`.trim(),
        );
      }
      return { vendedorId: vendedor.id, vendedorNome: vendedor.nome, atual };
    });

    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.upsert({
        where: {
          empresaId_vendedorId: { empresaId, vendedorId: anterior.vendedorId },
        },
        create: {
          empresaId,
          vendedorId: anterior.vendedorId,
          usuarioId: user.id,
          status: 'pareando',
          transporte: 'evolution_go',
          aceiteEm: new Date(),
          aceiteVersao: input.aceiteVersao ?? WHATSAPP_ACEITE_VERSAO,
          createdBy: user.id,
        },
        update: {
          // Reconectar amarra a instância a quem conectou agora (o aceite de
          // gravação também é dele, logo abaixo).
          usuarioId: user.id,
          status: 'pareando',
          transporte: 'evolution_go',
          ultimoErro: null,
          aceiteEm: new Date(),
          aceiteVersao: input.aceiteVersao ?? WHATSAPP_ACEITE_VERSAO,
          updatedBy: user.id,
        },
      }),
    );

    // Fora da transação de propósito: o provedor é uma chamada de rede que
    // pode demorar (criar instância, registrar webhook), e segurar a transação
    // aberta durante ela ocuparia uma conexão do pool por todo esse tempo.
    //
    // `arquivarMensagens` liga o arquivo de mensagens do lado do provedor, que
    // é de onde sai o histórico importado depois. Só quem configurou dias de
    // histórico guarda esse material.
    try {
      const instancia = await this.provedores.iniciar(empresaId, sessao.id, {
        arquivarMensagens: config.historicoDias > 0,
      });
      await this.gravarInstancia(empresaId, sessao.id, instancia);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappSessao.update({
          where: { id: sessao.id },
          data: {
            status: 'desconectada',
            ultimoErro: msg,
          },
        }),
      );
      throw erro;
    }

    return this.paraLeitura(sessao, anterior.vendedorNome);
  }

  /** A sessão institucional da empresa, ou null se ela nunca foi pareada. */
  async daEmpresa(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { empresaId, tipo: 'empresa' },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
  }

  /**
   * Conecta o número **da empresa** — a porta de entrada atendida pela IA.
   *
   * Separado de `conectar` porque a pergunta central daquele método não existe
   * aqui: lá tudo gira em torno de "qual é o vendedor deste usuário", e a
   * sessão institucional não tem vendedor nenhum. Tentar reaproveitar aquele
   * fluxo exigiria um vendedor de mentira só para satisfazer a chave.
   *
   * Quem chama é a administração (Administração > WhatsApp), não o vendedor: o
   * número é da empresa, e quem o pareia responde por ele.
   */
  async conectarEmpresa(
    empresaId: string,
    user: AuthenticatedUser,
    input?: WhatsappConectarEmpresa,
  ) {
    const config = await this.config.obter(empresaId);
    if (!config.ativo) {
      throw new BadRequestException(
        'O WhatsApp está desativado para esta empresa. Ative em Administração > WhatsApp.',
      );
    }
    this.provedores.exigirConfiguracao('evolution_go', config);

    const atual = await this.daEmpresa(empresaId);

    // Mesma regra do vendedor: já conectado, o caminho é desconectar antes.
    // Trocar por baixo derrubaria os atendimentos em andamento — e aqui isso
    // vale para a empresa inteira, não para uma pessoa.
    if (atual?.status === 'conectada') {
      throw new BadRequestException(
        `A empresa já tem o número ${atual.numero ?? ''} conectado. Desconecte antes de parear outro.`.trim(),
      );
    }

    const sessao = await this.prisma.withTenant(empresaId, async (tx) =>
      atual
        ? tx.whatsappSessao.update({
            where: { id: atual.id },
            data: {
              status: 'pareando',
              transporte: 'evolution_go',
              ultimoErro: null,
              aceiteEm: new Date(),
              aceiteVersao: input?.aceiteVersao ?? WHATSAPP_ACEITE_VERSAO,
              updatedBy: user.id,
            },
          })
        : tx.whatsappSessao.create({
            data: {
              empresaId,
              // Sem vendedor: é o que define a sessão institucional.
              vendedorId: null,
              tipo: 'empresa',
              status: 'pareando',
              transporte: 'evolution_go',
              aceiteEm: new Date(),
              aceiteVersao: input?.aceiteVersao ?? WHATSAPP_ACEITE_VERSAO,
              createdBy: user.id,
            },
          }),
    );

    try {
      const instancia = await this.provedores.iniciar(empresaId, sessao.id, {
        arquivarMensagens: config.historicoDias > 0,
      });
      await this.gravarInstancia(empresaId, sessao.id, instancia);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappSessao.update({
          where: { id: sessao.id },
          data: {
            status: 'desconectada',
            ultimoErro: msg,
          },
        }),
      );
      throw erro;
    }

    return this.paraLeitura(sessao, 'Empresa');
  }

  /**
   * Busca os templates aprovados no Business Manager e atualiza o mirror
   * local. Só a Cloud API tem o conceito — daí exigir a sessão institucional
   * já conectada, que é de onde vêm o Phone Number ID e o token a usar.
   */
  async sincronizarTemplatesEmpresa(empresaId: string) {
    const sessao = await this.daEmpresa(empresaId);
    if (!sessao) {
      throw new BadRequestException(
        'Conecte o número institucional na API Oficial antes de sincronizar os templates.',
      );
    }
    const templates = await this.provedores.sincronizarTemplates(
      empresaId,
      sessao.id,
    );
    return this.config.upsertTemplates(empresaId, templates);
  }

  /**
   * Estado do pareamento do número da empresa — o QR vem do provedor.
   *
   * Grava o estado de volta no banco, mesmo raciocínio de `pareamento()` (a
   * versão do vendedor): sem isso, uma sessão que nunca tem evento de conexão
   * — é o caso da Cloud API, que não pareia por QR e por isso nunca aparece
   * no webhook de conexão da Evolution GO — ficaria presa em `pareando` para
   * sempre, mesmo com a credencial já validada.
   */
  async pareamentoEmpresa(empresaId: string) {
    const sessao = await this.daEmpresa(empresaId);
    if (!sessao) {
      throw new NotFoundException('O número da empresa ainda não foi pareado.');
    }
    const doProvedor = await this.provedores.pareamento(empresaId, sessao.id);
    // Mesma regra de `pareamento()`: a gravação não pode derrubar a leitura.
    if (
      (doProvedor.status !== sessao.status ||
        doProvedor.numero !== sessao.numero) &&
      // A consulta não rebaixa sessão conectada para "pareando": logo depois
      // do PairSuccess o gateway responde por um instante "conectado, ainda
      // não logado", e gravar isso apagava o "conectada" que o webhook tinha
      // acabado de registrar (visto em 2026-10-06). Queda de verdade chega
      // por evento (Disconnected/LoggedOut), e esse continua valendo.
      !(sessao.status === 'conectada' && doProvedor.status === 'pareando')
    ) {
      try {
        const gravado = await this.registrarEstado(empresaId, sessao.id, {
          status: doProvedor.status,
          numero: doProvedor.numero,
          erro: doProvedor.erro,
        });
        // Número já em uso noutra instância: a conexão foi derrubada, e a
        // tela precisa dizer isso em vez de "conectado".
        if ('motivo' in gravado && gravado.motivo === 'numero-em-uso') {
          return {
            status: 'desconectada' as const,
            qr: null,
            numero: null,
            erro: mensagemNumeroEmUso(doProvedor.numero ?? sessao.numero ?? ''),
          };
        }
      } catch (erro) {
        this.logger.error(
          `Falha ao gravar o estado da sessão ${sessao.id} durante o pareamento ` +
            `(o QR foi devolvido mesmo assim): ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
    return doProvedor;
  }

  /**
   * Desconecta o número da empresa.
   *
   * As conversas ficam: elas são da empresa, não do aparelho — o mesmo
   * raciocínio do `onDelete: Restrict` na conversa.
   */
  async desconectarEmpresa(empresaId: string, user: AuthenticatedUser) {
    const sessao = await this.daEmpresa(empresaId);
    if (!sessao) {
      throw new NotFoundException('O número da empresa não está pareado.');
    }
    await this.provedores
      .removerInstancia(empresaId, sessao.id)
      .catch((erro) => {
        this.logger.warn(
          `Falha ao remover instância da empresa ${sessao.id} na desconexão: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      });
    const atualizada = await this.prisma.withTenant(empresaId, async (tx) => {
      // Mesmo fechamento da desconexão do vendedor: sem ele, o período fica
      // aberto e a auditoria diz que o número segue conectado.
      await tx.whatsappSessaoPeriodo.updateMany({
        where: { empresaId, sessaoId: sessao.id, desconectadoEm: null },
        data: { desconectadoEm: new Date() },
      });
      return tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: {
          status: 'desconectada',
          numero: null,
          jid: null,
          credencialCifrada: null,
          instanciaExterna: null,
          instanciaId: null,
          instanciaTokenCifrado: null,
          webhookSegredoCifrado: null,
          ultimoErro: null,
          updatedBy: user.id,
        },
      });
    });
    return this.paraLeitura(atualizada, 'Empresa');
  }

  /**
   * Estado do pareamento — é o que a tela consulta enquanto o QR não é lido.
   * O QR vem do provedor (expira em segundos e é renovado), não do banco.
   */
  async pareamento(empresaId: string, user: AuthenticatedUser) {
    const sessao = await this.minha(empresaId, user);
    if (!sessao) {
      return {
        status: 'desconectada' as const,
        qr: null,
        numero: null,
        erro: null,
      };
    }

    const doProvedor = await this.provedores.pareamento(empresaId, sessao.id);

    // O provedor é a fonte da verdade do estado da conexão — quem pareia é o
    // celular, fora do nosso fluxo. Sem gravar de volta, o banco fica preso em
    // `pareando` para sempre e a tela nunca sai do "aguardando leitura do QR",
    // mesmo com a sessão já ativa.
    //
    // **A gravação não pode derrubar a leitura.** O que esta rota existe para
    // entregar é o QR; persistir o status é efeito colateral útil. Sem este
    // try/catch a tela some com o código por causa de uma escrita que falhou —
    // foi exatamente o que aconteceu em 2026-09-19, com o banco do store do
    // worker mal configurado: o QR chegava do provedor e morria aqui, e a tela
    // ficava em "gerando o código..." para sempre, sem nada no log da API que
    // ligasse uma coisa à outra.
    if (
      (doProvedor.status !== sessao.status ||
        doProvedor.numero !== sessao.numero) &&
      // A consulta não rebaixa sessão conectada para "pareando": logo depois
      // do PairSuccess o gateway responde por um instante "conectado, ainda
      // não logado", e gravar isso apagava o "conectada" que o webhook tinha
      // acabado de registrar (visto em 2026-10-06). Queda de verdade chega
      // por evento (Disconnected/LoggedOut), e esse continua valendo.
      !(sessao.status === 'conectada' && doProvedor.status === 'pareando')
    ) {
      try {
        const gravado = await this.registrarEstado(empresaId, sessao.id, {
          status: doProvedor.status,
          numero: doProvedor.numero,
          erro: doProvedor.erro,
        });
        // Número já em uso noutra instância: a conexão foi derrubada, e a
        // tela precisa dizer isso em vez de "conectado".
        if ('motivo' in gravado && gravado.motivo === 'numero-em-uso') {
          return {
            status: 'desconectada' as const,
            qr: null,
            numero: null,
            erro: mensagemNumeroEmUso(doProvedor.numero ?? sessao.numero ?? ''),
          };
        }
      } catch (erro) {
        this.logger.error(
          `Falha ao gravar o estado da sessão ${sessao.id} durante o pareamento ` +
            `(o QR foi devolvido mesmo assim): ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }

    return {
      status: doProvedor.status as typeof sessao.status,
      qr: doProvedor.qr,
      numero: doProvedor.numero ?? sessao.numero,
      erro: doProvedor.erro,
    };
  }

  /**
   * Grava o estado que veio do worker.
   *
   * Ponto único de escrita do estado de conexão, e é para isso que serve: o
   * worker avisa por conta própria quando a conexão cai ou o aparelho é
   * removido pelo celular, e a tela de pareamento reporta o que consultou.
   * Os dois caminhos precisam da mesma regra.
   *
   * Não é chamado por usuário nenhum — só pela rota interna e por
   * `pareamento`. Por isso não confere permissão, e por isso **valida o
   * status**: o que chega é texto de outro processo, não enum do Prisma.
   */
  async registrarEstado(
    empresaId: string,
    sessaoId: string,
    dados: { status: string; numero: string | null; erro: string | null },
  ) {
    const status = (WHATSAPP_SESSAO_STATUS as readonly string[]).includes(
      dados.status,
    )
      ? (dados.status as WhatsappSessaoStatus)
      : 'desconectada';

    // O número é único (06/10/2026): conectado em outra sessão, de qualquer
    // empresa, esta conexão é recusada antes de virar "conectada". Era o mesmo
    // celular em duas instâncias que fazia a conversa aparecer nas duas.
    if (status === 'conectada') {
      const numero =
        dados.numero ??
        (
          await this.prisma.withTenant(empresaId, (tx) =>
            tx.whatsappSessao.findFirst({
              where: { id: sessaoId },
              select: { numero: true },
            }),
          )
        )?.numero ??
        null;
      if (numero && (await this.numeroEmUso(empresaId, sessaoId, numero))) {
        await this.recusarNumeroEmUso(empresaId, sessaoId, numero);
        return { gravado: false, motivo: 'numero-em-uso' as const };
      }
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const sessao = await tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        select: { id: true, vendedorId: true, numero: true },
      });
      // Sessão apagada enquanto o worker ainda a mantinha viva: nada a gravar,
      // e estourar aqui só encheria o log do worker.
      if (!sessao) return { gravado: false };

      await tx.whatsappSessao.update({
        where: { id: sessaoId },
        data: {
          status,
          // Número só é sobrescrito quando vem preenchido: durante o
          // pareamento ele é nulo, e apagá-lo faria a tela perder a
          // identificação do aparelho a cada oscilação.
          ...(dados.numero ? { numero: dados.numero } : {}),
          ultimoErro: dados.erro,
          ...(status === 'conectada' ? { ultimaConexao: new Date() } : {}),
        },
      });

      // Registro de períodos de conexão para auditoria e histórico permanente
      const numeroEfetivo = dados.numero || sessao.numero;
      if (status === 'conectada' && numeroEfetivo) {
        // Encerra qualquer período aberto anterior com número diferente
        await tx.whatsappSessaoPeriodo.updateMany({
          where: {
            empresaId,
            sessaoId,
            desconectadoEm: null,
            numero: { not: numeroEfetivo },
          },
          data: { desconectadoEm: new Date() },
        });

        // Garante que existe período aberto para este número
        const periodoAberto = await tx.whatsappSessaoPeriodo.findFirst({
          where: {
            empresaId,
            sessaoId,
            numero: numeroEfetivo,
            desconectadoEm: null,
          },
        });
        if (!periodoAberto) {
          await tx.whatsappSessaoPeriodo.create({
            data: {
              empresaId,
              sessaoId,
              vendedorId: sessao.vendedorId,
              numero: numeroEfetivo,
              conectadoEm: new Date(),
            },
          });
        }
      } else if (status === 'desconectada') {
        // Encerra períodos abertos desta sessão
        await tx.whatsappSessaoPeriodo.updateMany({
          where: {
            empresaId,
            sessaoId,
            desconectadoEm: null,
          },
          data: { desconectadoEm: new Date() },
        });
      }

      return { gravado: true };
    });
  }

  /**
   * O número já está conectado (ou pareando) em **outra** sessão, de qualquer
   * empresa? A consulta atravessa empresas pela função SECURITY DEFINER
   * `whatsapp_numero_em_uso`, que devolve só ids.
   */
  private async numeroEmUso(
    empresaId: string,
    sessaoId: string,
    numero: string,
  ): Promise<boolean> {
    const outras = await this.prisma.withTenant(empresaId, (tx) =>
      tx.$queryRaw<{ sessaoId: string; empresaId: string }[]>`
        SELECT * FROM whatsapp_numero_em_uso(${numero}, ${sessaoId})
      `,
    );
    if (outras.length === 0) return false;
    this.logger.warn(
      `Número ${numero} recusado na sessão ${sessaoId} (empresa ${empresaId}): ` +
        `já em uso em ${outras.map((o) => `${o.sessaoId}@${o.empresaId}`).join(', ')}`,
    );
    return true;
  }

  /**
   * Derruba a conexão que tentou usar um número já em uso: tira o aparelho da
   * Evolution GO (senão ele segue recebendo tudo) e deixa a sessão
   * desconectada, com o motivo na tela. O histórico não é tocado.
   */
  private async recusarNumeroEmUso(
    empresaId: string,
    sessaoId: string,
    numero: string,
  ) {
    await this.provedores.removerInstancia(empresaId, sessaoId).catch((erro) => {
      this.logger.warn(
        `Falha ao remover a instância ${sessaoId} com número em uso: ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      );
    });
    await this.prisma.withTenant(empresaId, async (tx) => {
      await tx.whatsappSessaoPeriodo.updateMany({
        where: { empresaId, sessaoId, desconectadoEm: null },
        data: { desconectadoEm: new Date() },
      });
      await tx.whatsappSessao.update({
        where: { id: sessaoId },
        data: {
          status: 'desconectada',
          numero: null,
          jid: null,
          credencialCifrada: null,
          instanciaExterna: null,
          instanciaId: null,
          instanciaTokenCifrado: null,
          webhookSegredoCifrado: null,
          ultimoErro: mensagemNumeroEmUso(numero),
        },
      });
    });
  }

  /** Desconecta o próprio aparelho. Não aceita id de fora — ver regra 2. */
  async desconectar(empresaId: string, user: AuthenticatedUser) {
    const alvo = await this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true, usuarioId: true },
      });
      // Só quem conectou desconecta; a de outro usuário é da Administração.
      if (!sessao || sessao.usuarioId !== user.id)
        throw new NotFoundException('Nenhuma sessão para desconectar');
      return { sessaoId: sessao.id, vendedorNome: vendedor.nome };
    });

    // O vendedor pediu para sair, e sair é sair: o aparelho deve deixar de
    // aparecer em "Aparelhos conectados" no celular dele. Provedor fora do ar
    // não pode impedir a marcação deste lado — a alternativa seria a tela
    // continuar dizendo "conectado" para uma sessão que ele já abandonou.
    await this.provedores
      .removerInstancia(empresaId, alvo.sessaoId)
      .catch((erro) => {
        this.logger.warn(
          `Falha ao remover instância ${alvo.sessaoId} na desconexão: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      });

    const atualizada = await this.prisma.withTenant(empresaId, async (tx) => {
      // Fecha período de conexão aberto
      await tx.whatsappSessaoPeriodo.updateMany({
        where: {
          empresaId,
          sessaoId: alvo.sessaoId,
          desconectadoEm: null,
        },
        data: { desconectadoEm: new Date() },
      });

      return tx.whatsappSessao.update({
        where: { id: alvo.sessaoId },
        data: {
          status: 'desconectada',
          numero: null,
          jid: null,
          credencialCifrada: null,
          instanciaExterna: null,
          instanciaId: null,
          instanciaTokenCifrado: null,
          webhookSegredoCifrado: null,
          ultimoErro: null,
          updatedBy: user.id,
        },
      });
    });
    return this.paraLeitura(atualizada, alvo.vendedorNome);
  }

  /**
   * Sessões da equipe — quem o supervisor supervisiona. Depende de
   * `whatsapp-equipe.visualizar`; sem ela, a lista traz só a própria.
   */
  async listarEquipe(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // Este endpoint alimenta o seletor operacional da Central, portanto
      // nunca transforma acesso administrativo em "toda a empresa". A lista
      // é sempre formada pelo vendedor do usuário + sua equipe direta.
      const vendedor = await tx.vendedor.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { id: true, tipo: true },
      });
      if (!vendedor) return [];

      let vendedorIds = [vendedor.id];
      if (
        user.permissoes.includes('whatsapp-equipe.visualizar') &&
        vendedor.tipo === 'superior'
      ) {
        // A **árvore inteira** abaixo dele, não só quem responde direto: com a
        // hierarquia em cadeia (`superiorId`, sem teto de níveis), o gerente
        // que só enxergasse os filhos perderia os vendedores pendurados nos
        // supervisores dele. `resolverEscopoVendedores` é a mesma função que
        // recorta o resto do sistema — uma definição só de "meu time".
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);
        // `null` = alcance irrestrito (administrador). Aqui isso **não** vira
        // "a empresa toda": este endpoint alimenta o seletor operacional da
        // Central, e acesso administrativo não é motivo para aparecer o
        // aparelho de todo mundo.
        vendedorIds = escopo ?? [vendedor.id];
      }

      const sessoes = await tx.whatsappSessao.findMany({
        where: { vendedorId: { in: vendedorIds } },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      return sessoes.map((s) =>
        this.paraLeitura(s, s.vendedor?.nome ?? 'Empresa'),
      );
    });
  }

  /**
   * Reabre uma instância existente pela central administrativa.
   *
   * A primeira conexão continua pertencendo ao vendedor porque inclui o aceite
   * de gravação. Aqui só entram sessões que já passaram por esse fluxo.
   */
  async reconectarAdministracao(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
  ) {
    const config = await this.config.obter(empresaId);
    if (!config.ativo) {
      throw new BadRequestException(
        'Ative o atendimento por WhatsApp antes de conectar uma instância.',
      );
    }
    this.provedores.exigirConfiguracao(config.transporte, config);

    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');
    if (!sessao.aceiteEm) {
      throw new BadRequestException(
        'O vendedor precisa iniciar a primeira conexão pela tela de Conversas.',
      );
    }

    try {
      const instancia = await this.provedores.iniciar(empresaId, sessao.id, {
        arquivarMensagens: config.historicoDias > 0,
      });
      await this.gravarInstancia(empresaId, sessao.id, instancia);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappSessao.update({
          where: { id: sessao.id },
          data: {
            status: 'desconectada',
            ultimoErro: msg,
          },
        }),
      );
      throw erro;
    }

    const atualizada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: {
          status: 'pareando',
          ultimoErro: null,
          updatedBy: user.id,
        },
      }),
    );
    return this.paraLeitura(atualizada, sessao.vendedor?.nome ?? 'Empresa');
  }

  /**
   * Remove a conexão sem apagar a linha: conversas referenciam a sessão e são
   * histórico da empresa. A sessão sai do WhatsApp e o estado volta ao zero.
   *
   * O que sobra do lado do provedor difere por transporte, e o texto abaixo
   * vale a leitura antes de tratar isto como exclusão de credencial: no zapo, o
   * store técnico não expõe expurgo, então **não** se afirma que o material
   * Signal foi apagado; na Evolution GO, o logout invalida o pareamento, mas a
   * instância continua existindo no gateway (é a exclusão que a descarta).
   */
  async removerAdministracao(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
  ) {
    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');

    // Melhor-esforço: provedor fora do ar não pode impedir a administração de
    // marcar a instância como desconectada deste lado.
    await this.provedores
      .removerInstancia(empresaId, sessao.id)
      .catch((erro) => {
        this.logger.warn(
          `Falha ao remover instância ${sessao.id} na administração: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      });

    const atualizada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: {
          status: 'desconectada',
          numero: null,
          jid: null,
          credencialCifrada: null,
          instanciaExterna: null,
          instanciaId: null,
          instanciaTokenCifrado: null,
          webhookSegredoCifrado: null,
          ultimoErro: null,
          updatedBy: user.id,
        },
      }),
    );
    return this.paraLeitura(atualizada, sessao.vendedor?.nome ?? 'Empresa');
  }

  /**
   * Apaga o histórico de conversas de uma instância.
   *
   * Uma conversa apagada leva junto mensagens, reações, agendamentos e as
   * ações registradas (`ON DELETE CASCADE` no banco) — e as notificações do
   * sino que apontavam para ela, que não têm FK e ficariam levando o vendedor
   * a uma conversa inexistente.
   *
   * O contato **fica**: ele é o vínculo com o cadastro de cliente, custou
   * trabalho de alguém e não é conteúdo de conversa. Apagá-lo obrigaria a
   * revincular tudo à mão depois.
   *
   * Não há volta e não há exportação antes: quem chama já confirmou na tela.
   */
  async limparConversas(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
  ) {
    // Histórico permanente para todo o resto: a rota exige
    // `whatsapp-config.excluir`, que só o administrador da empresa tem
    // (decisão de 2026-10-05).
    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');

    const resultado = await this.prisma.withTenant(empresaId, async (tx) => {
      const conversas = await tx.whatsappConversa.findMany({
        where: { sessaoId: sessao.id },
        select: { id: true },
      });
      const apagado = await apagarConversas(
        tx,
        conversas.map((c) => c.id),
      );
      await tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: { updatedBy: user.id },
      });
      return apagado;
    });

    this.logger.warn(
      `Histórico da instância ${sessao.id} apagado por ${user.id}: ` +
        `${resultado.conversas} conversas, ${resultado.mensagens} mensagens.`,
    );
    return { ...resultado, vendedor: sessao.vendedor?.nome ?? 'Empresa' };
  }

  /**
   * Exclui a instância **e** o histórico dela, de vez.
   *
   * O `excluirInstancia` comum preserva a linha quando há conversas (o
   * histórico é permanente). Este é o caminho do administrador da empresa,
   * atrás de `whatsapp-config.excluir`: apaga conversas, mensagens e
   * períodos e só então a sessão. Mesma exigência de estar desconectada — não
   * se apaga o histórico de um número que continua recebendo.
   */
  async excluirInstanciaComHistorico(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
  ) {
    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');
    if (sessao.status !== 'desconectada') {
      throw new BadRequestException(
        'Só é possível excluir instância desconectada. Remova a conexão antes.',
      );
    }

    // Melhor-esforço, como no `excluirInstancia`: o gateway pode já não
    // conhecer a instância.
    await this.provedores
      .removerInstancia(empresaId, sessao.id)
      .catch(() => undefined);

    const resultado = await this.prisma.withTenant(empresaId, async (tx) => {
      const conversas = await tx.whatsappConversa.findMany({
        where: { sessaoId: sessao.id },
        select: { id: true },
      });
      const apagado = await apagarConversas(
        tx,
        conversas.map((c) => c.id),
      );
      await tx.whatsappSessaoPeriodo.deleteMany({
        where: { sessaoId: sessao.id },
      });
      await tx.whatsappSessao.delete({ where: { id: sessao.id } });
      return apagado;
    });

    this.logger.warn(
      `Instância ${sessao.id} excluída com o histórico por ${user.id}: ` +
        `${resultado.conversas} conversas, ${resultado.mensagens} mensagens.`,
    );
    return {
      ...resultado,
      excluida: true,
      vendedor: sessao.vendedor?.nome ?? 'Empresa',
    };
  }

  /**
   * Encerra e remove a instância técnica.
   *
   * Se a sessão tiver conversas registradas, o histórico é PERMANENTE: a linha
   * não é apagada do banco (para manter a integridade das mensagens e períodos),
   * mas a conexão externa no provedor é removida e as credenciais são limpas.
   * Se não houver conversas, a linha pode ser excluída de vez.
   */
  async excluirInstancia(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
  ) {
    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');

    if (sessao.status !== 'desconectada') {
      throw new BadRequestException(
        'Só é possível excluir instância desconectada. Remova a conexão antes.',
      );
    }

    const conversas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConversa.count({ where: { sessaoId: sessao.id } }),
    );

    // O provedor pode já não conhecer esta sessão (worker reiniciado,
    // instância nunca criada): o encerramento é melhor-esforço.
    await this.provedores
      .removerInstancia(empresaId, sessao.id)
      .catch(() => undefined);

    if (conversas > 0) {
      // O histórico é permanente: arquiva a sessão, limpa credenciais mas mantém a linha
      await this.prisma.withTenant(empresaId, async (tx) => {
        await tx.whatsappSessaoPeriodo.updateMany({
          where: { empresaId, sessaoId: sessao.id, desconectadoEm: null },
          data: { desconectadoEm: new Date() },
        });

        await tx.whatsappSessao.update({
          where: { id: sessao.id },
          data: {
            status: 'desconectada',
            numero: null,
            jid: null,
            credencialCifrada: null,
            instanciaExterna: null,
            instanciaId: null,
            instanciaTokenCifrado: null,
            webhookSegredoCifrado: null,
            ultimoErro: null,
            updatedBy: user.id,
          },
        });
      });

      return {
        excluida: false,
        arquivada: true,
        vendedor: sessao.vendedor?.nome ?? 'Empresa',
        por: user.id,
        mensagem:
          'A instância possui conversas no histórico permanente. A conexão foi encerrada e o histórico foi preservado.',
      };
    }

    await this.prisma.withTenant(empresaId, async (tx) => {
      await tx.whatsappSessaoPeriodo.deleteMany({
        where: { sessaoId: sessao.id },
      });
      await tx.whatsappSessao.delete({ where: { id: sessao.id } });
    });

    return {
      excluida: true,
      arquivada: false,
      vendedor: sessao.vendedor?.nome ?? 'Empresa',
      por: user.id,
    };
  }

  /**
   * Manda o provedor despejar aqui o histórico que o celular já tem.
   *
   * Quem decide o alcance é a empresa, em `historicoDias` — e o padrão é zero,
   * que não importa nada. Quantas mensagens viram registro é decisão da rota de
   * ingestão, que aplica a regra de sempre: conversa de contato sem cliente
   * vinculado não é gravada.
   *
   * O número devolvido significa coisas diferentes por transporte: o worker do
   * zapo sabe quantas encontrou antes de começar; a Evolution GO só dispara a
   * sincronização e devolve zero, porque o material chega depois, por evento.
   * Zero aqui não quer dizer "não veio nada".
   *
   * Só faz sentido com a instância conectada: o material vem do aparelho, por
   * uma sessão viva.
   */
  async importarHistorico(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
  ) {
    const config = await this.config.obter(empresaId);
    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');

    if (config.historicoDias <= 0) {
      throw new BadRequestException(
        'Os dias de histórico estão em zero. Configure em Administração > WhatsApp antes de importar.',
      );
    }
    if (sessao.status !== 'conectada') {
      throw new BadRequestException(
        'A instância precisa estar conectada para importar o histórico do aparelho.',
      );
    }

    // Âncora de cada conversa: a mensagem mais antiga que já temos. O pedido
    // da Evolution GO é "N anteriores a esta", por conversa (ver o provider).
    const ancoras = await this.prisma.withTenant(empresaId, async (tx) => {
      const conversas = await tx.whatsappConversa.findMany({
        where: { sessaoId: sessao.id },
        select: {
          contato: { select: { jid: true } },
          mensagens: {
            orderBy: { criadaEm: 'asc' },
            take: 1,
            select: { externoId: true, direcao: true, criadaEm: true },
          },
        },
      });
      return conversas
        .filter((c) => c.mensagens.length > 0)
        .map((c) => ({
          jid: c.contato.jid,
          externoId: c.mensagens[0].externoId,
          minha: c.mensagens[0].direcao === 'saida',
          criadaEm: c.mensagens[0].criadaEm,
        }));
    });

    // O provedor só faz os pedidos; o material chega depois, em segundo
    // plano, pelo webhook — importar meses de conversa não cabe no timeout de
    // uma requisição. As conversas vão aparecendo na tela de Atendimento.
    const resultado = await this.provedores.importarHistorico(
      empresaId,
      sessao.id,
      config.historicoDias,
      ancoras,
    );

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: { updatedBy: user.id },
      }),
    );

    return {
      dias: config.historicoDias,
      encontradas: resultado.encontradas,
      conversas: resultado.conversas,
      vendedor: sessao.vendedor?.nome ?? 'Empresa',
    };
  }

  /** A credencial cifrada nunca sai da API — nem para o supervisor. */
  private paraLeitura(
    sessao: {
      id: string;
      empresaId: string;
      vendedorId: string | null;
      tipo?: string;
      numero: string | null;
      status: string;
      transporte: string;
      ultimaConexao: Date | null;
      ultimoErro: string | null;
      aceiteEm: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    vendedorNome: string,
  ) {
    return {
      id: sessao.id,
      empresaId: sessao.empresaId,
      vendedorId: sessao.vendedorId,
      vendedorNome,
      numero: sessao.numero,
      status: sessao.status,
      transporte: sessao.transporte,
      ultimaConexao: sessao.ultimaConexao,
      ultimoErro: sessao.ultimoErro,
      aceiteEm: sessao.aceiteEm,
      createdAt: sessao.createdAt,
      updatedAt: sessao.updatedAt,
    };
  }
}
