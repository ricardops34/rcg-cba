import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';
import { escopoLeituraWhatsapp } from './escopo-whatsapp';
import {
  WHATSAPP_ACEITE_VERSAO,
  WHATSAPP_SESSAO_STATUS,
  type WhatsappConectar,
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
@Injectable()
export class WhatsappSessaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsappConfigService,
    private readonly worker: WhatsappWorkerClient,
  ) {}

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
      return sessao ? this.paraLeitura(sessao, vendedor.nome) : null;
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

    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const atual = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
      });

      // Regra 1: um número por vendedor. Já conectado, o caminho é desconectar
      // primeiro — trocar por baixo derrubaria um atendimento em andamento.
      if (atual?.status === 'conectada') {
        throw new BadRequestException(
          `Você já tem o número ${atual.numero ?? ''} conectado. Desconecte antes de parear outro.`.trim(),
        );
      }

      const sessao = await tx.whatsappSessao.upsert({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        create: {
          empresaId,
          vendedorId: vendedor.id,
          status: 'pareando',
          transporte: config.transporte,
          aceiteEm: new Date(),
          aceiteVersao: input.aceiteVersao ?? WHATSAPP_ACEITE_VERSAO,
          createdBy: user.id,
        },
        update: {
          status: 'pareando',
          transporte: config.transporte,
          ultimoErro: null,
          aceiteEm: new Date(),
          aceiteVersao: input.aceiteVersao ?? WHATSAPP_ACEITE_VERSAO,
          updatedBy: user.id,
        },
      });

      await this.worker.chamar(config.workerUrl, '/sessoes', {
        metodo: 'POST',
        // empresaId vai junto porque o worker precisa devolvê-lo na mensagem
        // recebida: as tabelas têm RLS, e sem tenant no contexto a API não
        // conseguiria nem localizar a própria sessão.
        // `arquivarMensagens` liga o arquivo de mensagens no store do worker,
        // que é de onde sai o histórico importado depois. Só quem configurou
        // dias de histórico guarda esse material.
        corpo: {
          sessaoId: sessao.id,
          empresaId,
          transporte: config.transporte,
          arquivarMensagens: config.historicoDias > 0,
        },
      });

      return this.paraLeitura(sessao, vendedor.nome);
    });
  }

  /**
   * Estado do pareamento — é o que a tela consulta enquanto o QR não é lido.
   * O QR vem do worker (expira em segundos e é renovado), não do banco.
   */
  async pareamento(empresaId: string, user: AuthenticatedUser) {
    const config = await this.config.obter(empresaId);
    const sessao = await this.minha(empresaId, user);
    if (!sessao) {
      return { status: 'desconectada' as const, qr: null, numero: null, erro: null };
    }

    const doWorker = await this.worker.chamar<{
      status: string;
      qr: string | null;
      numero: string | null;
      erro: string | null;
    }>(config.workerUrl, `/sessoes/${sessao.id}/pareamento`);

    // O worker é a fonte da verdade do estado da conexão — quem pareia é o
    // celular, fora do nosso fluxo. Sem gravar de volta, o banco fica preso em
    // `pareando` para sempre e a tela nunca sai do "aguardando leitura do QR",
    // mesmo com a sessão já ativa.
    if (doWorker.status !== sessao.status || doWorker.numero !== sessao.numero) {
      await this.registrarEstado(empresaId, sessao.id, {
        status: doWorker.status,
        numero: doWorker.numero,
        erro: doWorker.erro,
      });
    }

    return {
      status: doWorker.status as typeof sessao.status,
      qr: doWorker.qr,
      numero: doWorker.numero ?? sessao.numero,
      erro: doWorker.erro,
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
    const status = (
      WHATSAPP_SESSAO_STATUS as readonly string[]
    ).includes(dados.status)
      ? (dados.status as WhatsappSessaoStatus)
      : 'desconectada';

    return this.prisma.withTenant(empresaId, async (tx) => {
      const sessao = await tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        select: { id: true },
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
      return { gravado: true };
    });
  }

  /** Desconecta o próprio aparelho. Não aceita id de fora — ver regra 2. */
  async desconectar(empresaId: string, user: AuthenticatedUser) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
      });
      if (!sessao) throw new NotFoundException('Nenhuma sessão para desconectar');

      await this.worker
        .chamar(config.workerUrl, `/sessoes/${sessao.id}`, { metodo: 'DELETE' })
        // Worker fora do ar não pode impedir o vendedor de marcar o aparelho
        // como desconectado do lado de cá.
        .catch(() => undefined);

      const atualizada = await tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: {
          status: 'desconectada',
          credencialCifrada: null,
          updatedBy: user.id,
        },
      });
      return this.paraLeitura(atualizada, vendedor.nome);
    });
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
        (vendedor.tipo === 'gerente' || vendedor.tipo === 'supervisor')
      ) {
        const equipe = await tx.vendedor.findMany({
          where: {
            empresaId,
            deletedAt: null,
            ...(vendedor.tipo === 'gerente'
              ? { gerenteId: vendedor.id }
              : { supervisorId: vendedor.id }),
          },
          select: { id: true },
        });
        vendedorIds = [vendedor.id, ...equipe.map((integrante) => integrante.id)];
      }

      const sessoes = await tx.whatsappSessao.findMany({
        where: { vendedorId: { in: vendedorIds } },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      return sessoes.map((s) => this.paraLeitura(s, s.vendedor.nome));
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
    if (config.transporte !== 'zapo') {
      throw new BadRequestException(
        'O adaptador selecionado ainda não permite gerenciar instâncias.',
      );
    }

    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');
    if (!sessao.aceiteEm) {
      throw new BadRequestException(
        'O vendedor precisa iniciar a primeira conexão pela tela de Atendimento.',
      );
    }

    await this.worker.chamar(config.workerUrl, '/sessoes', {
      metodo: 'POST',
      corpo: {
        sessaoId: sessao.id,
        empresaId,
        transporte: 'zapo',
        arquivarMensagens: config.historicoDias > 0,
      },
    });

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
    return this.paraLeitura(atualizada, sessao.vendedor.nome);
  }

  /**
   * Remove a conexão sem apagar a linha: conversas referenciam a sessão e são
   * histórico da empresa. O cliente é encerrado e o estado volta ao zero.
   * O store técnico do zapo-js não expõe aqui uma operação de expurgo; portanto
   * não se afirma que o material Signal persistido foi apagado.
   */
  async removerAdministracao(
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

    if (config.workerUrl) {
      await this.worker
        .chamar(config.workerUrl, `/sessoes/${sessao.id}`, {
          metodo: 'DELETE',
        })
        .catch(() => undefined);
    }

    const atualizada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: {
          status: 'desconectada',
          numero: null,
          jid: null,
          credencialCifrada: null,
          ultimoErro: null,
          updatedBy: user.id,
        },
      }),
    );
    return this.paraLeitura(atualizada, sessao.vendedor.nome);
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
    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.findFirst({
        where: { id: sessaoId },
        include: { vendedor: { select: { nome: true } } },
      }),
    );
    if (!sessao) throw new NotFoundException('Instância não encontrada');

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversas = await tx.whatsappConversa.findMany({
        where: { sessaoId: sessao.id },
        select: { id: true },
      });
      if (conversas.length === 0) {
        return { conversas: 0, mensagens: 0, vendedor: sessao.vendedor.nome };
      }
      const ids = conversas.map((c) => c.id);

      // Contado antes de apagar: depois do delete não há o que contar, e o
      // número é o que a tela mostra de volta para quem confirmou.
      const mensagens = await tx.whatsappMensagem.count({
        where: { conversaId: { in: ids } },
      });

      // `referenciaId` guarda o id da conversa; sem FK, o cascade não alcança.
      await tx.notificacao.deleteMany({ where: { referenciaId: { in: ids } } });
      await tx.whatsappConversa.deleteMany({ where: { id: { in: ids } } });

      await tx.whatsappSessao.update({
        where: { id: sessao.id },
        data: { updatedBy: user.id },
      });

      return {
        conversas: conversas.length,
        mensagens,
        vendedor: sessao.vendedor.nome,
      };
    });
  }

  /**
   * Apaga a instância de vez — a linha, não só a conexão.
   *
   * Só a desconectada: apagar uma sessão viva deixaria o worker com um cliente
   * pendurado sem dono deste lado. E só a que não tem histórico: conversa é
   * registro da empresa, e o banco protege isso com `ON DELETE RESTRICT`. Em
   * vez de deixar o erro do Postgres chegar cru na tela, o caminho é explícito
   * — limpe as conversas primeiro, decidindo isso de propósito.
   *
   * O que fica no worker: o material técnico da sessão no store do zapo-js
   * (chaves Signal, agenda). O `DELETE` no worker encerra o cliente; o expurgo
   * do store não é exposto pela biblioteca, e não se afirma aqui o que não se
   * fez.
   */
  async excluirInstancia(
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

    if (sessao.status !== 'desconectada') {
      throw new BadRequestException(
        'Só é possível excluir instância desconectada. Remova a conexão antes.',
      );
    }

    const conversas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConversa.count({ where: { sessaoId: sessao.id } }),
    );
    if (conversas > 0) {
      throw new BadRequestException(
        `Esta instância tem ${conversas} ${conversas === 1 ? 'conversa' : 'conversas'} no histórico. ` +
          'Limpe as conversas antes de excluir.',
      );
    }

    // O worker pode já não conhecer esta sessão (reiniciou, nunca conectou):
    // o encerramento é melhor-esforço, e a linha some de qualquer forma.
    if (config.workerUrl) {
      await this.worker
        .chamar(config.workerUrl, `/sessoes/${sessao.id}`, { metodo: 'DELETE' })
        .catch(() => undefined);
    }

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.delete({ where: { id: sessao.id } }),
    );
    return { excluida: true, vendedor: sessao.vendedor.nome, por: user.id };
  }

  /**
   * Manda o worker despejar aqui o histórico que o celular já tem.
   *
   * Quem decide o alcance é a empresa, em `historicoDias` — e o padrão é zero,
   * que não importa nada. O worker devolve quantas mensagens entregou; quantas
   * viram registro é decisão da rota de ingestão, que aplica a regra de
   * sempre: conversa de contato sem cliente vinculado não é gravada.
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

    // O worker responde com o tamanho do trabalho e segue entregando em
    // segundo plano: importar meses de conversa não cabe no timeout de uma
    // requisição. As conversas vão aparecendo na tela de Atendimento.
    const resultado = await this.worker.chamar<{
      encontradas: number;
      conversas: number;
    }>(config.workerUrl, `/sessoes/${sessao.id}/historico/importar`, {
      metodo: 'POST',
      corpo: { dias: config.historicoDias },
    });

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
      vendedor: sessao.vendedor.nome,
    };
  }

  /** A credencial cifrada nunca sai da API — nem para o supervisor. */
  private paraLeitura(
    sessao: {
      id: string;
      empresaId: string;
      vendedorId: string;
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
