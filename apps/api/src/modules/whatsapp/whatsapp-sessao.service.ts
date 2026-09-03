import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { cifrarSegredo } from './whatsapp-cripto';
import type { DadosInstancia } from './providers/whatsapp-provider';
import { escopoLeituraWhatsapp } from './escopo-whatsapp';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
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
    // Antes de criar a linha: o que falta é sempre um campo de configuração, e
    // o sintoma sem esta conferência é um 502 na tela do vendedor que não diz
    // qual campo ficou vazio.
    this.provedores.exigirConfiguracao(config.transporte, config);

    const anterior = await this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const atual = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true, status: true, numero: true, transporte: true },
      });

      // Regra 1: um número por vendedor. Já conectado, o caminho é desconectar
      // primeiro — trocar por baixo derrubaria um atendimento em andamento.
      if (atual?.status === 'conectada') {
        throw new BadRequestException(
          `Você já tem o número ${atual.numero ?? ''} conectado. Desconecte antes de parear outro.`.trim(),
        );
      }
      return { vendedorId: vendedor.id, vendedorNome: vendedor.nome, atual };
    });

    // Troca de provedor: a sessão do provedor **anterior** precisa morrer
    // antes.
    //
    // Sem isto, uma instância da Evolution GO continuaria pareada ao celular
    // do vendedor depois que a empresa passou para o zapo — recebendo as
    // mensagens dele num gateway que a API já não escuta (o webhook passa a
    // ser recusado). O sintoma seria o pior possível: conversa que acontece no
    // aparelho e não aparece em lugar nenhum.
    //
    // Melhor-esforço: provedor fora do ar não pode impedir o vendedor de
    // parear no novo. Os campos de instância são limpos junto, para o
    // pareamento seguinte nascer sem herança do provedor antigo.
    if (anterior.atual && anterior.atual.transporte !== config.transporte) {
      await this.provedores
        .sairDoWhatsapp(empresaId, anterior.atual.id)
        .catch(() => undefined);
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappSessao.update({
          where: { id: anterior.atual!.id },
          data: {
            instanciaExterna: null,
            instanciaId: null,
            instanciaTokenCifrado: null,
            webhookSegredoCifrado: null,
            numero: null,
            jid: null,
            credencialCifrada: null,
          },
        }),
      );
    }

    const sessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.upsert({
        where: {
          empresaId_vendedorId: { empresaId, vendedorId: anterior.vendedorId },
        },
        create: {
          empresaId,
          vendedorId: anterior.vendedorId,
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
      }),
    );

    // Fora da transação de propósito: o provedor é uma chamada de rede que
    // pode demorar (criar instância, registrar webhook), e segurar a transação
    // aberta durante ela ocuparia uma conexão do pool por todo esse tempo.
    //
    // `arquivarMensagens` liga o arquivo de mensagens do lado do provedor, que
    // é de onde sai o histórico importado depois. Só quem configurou dias de
    // histórico guarda esse material.
    const instancia = await this.provedores.iniciar(empresaId, sessao.id, {
      arquivarMensagens: config.historicoDias > 0,
    });
    await this.gravarInstancia(empresaId, sessao.id, instancia);

    return this.paraLeitura(sessao, anterior.vendedorNome);
  }

  /**
   * Estado do pareamento — é o que a tela consulta enquanto o QR não é lido.
   * O QR vem do provedor (expira em segundos e é renovado), não do banco.
   */
  async pareamento(empresaId: string, user: AuthenticatedUser) {
    const sessao = await this.minha(empresaId, user);
    if (!sessao) {
      return { status: 'desconectada' as const, qr: null, numero: null, erro: null };
    }

    const doProvedor = await this.provedores.pareamento(empresaId, sessao.id);

    // O provedor é a fonte da verdade do estado da conexão — quem pareia é o
    // celular, fora do nosso fluxo. Sem gravar de volta, o banco fica preso em
    // `pareando` para sempre e a tela nunca sai do "aguardando leitura do QR",
    // mesmo com a sessão já ativa.
    if (
      doProvedor.status !== sessao.status ||
      doProvedor.numero !== sessao.numero
    ) {
      await this.registrarEstado(empresaId, sessao.id, {
        status: doProvedor.status,
        numero: doProvedor.numero,
        erro: doProvedor.erro,
      });
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
    const alvo = await this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user);
      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true },
      });
      if (!sessao) throw new NotFoundException('Nenhuma sessão para desconectar');
      return { sessaoId: sessao.id, vendedorNome: vendedor.nome };
    });

    // O vendedor pediu para sair, e sair é sair: o aparelho deve deixar de
    // aparecer em "Aparelhos conectados" no celular dele. Provedor fora do ar
    // não pode impedir a marcação deste lado — a alternativa seria a tela
    // continuar dizendo "conectado" para uma sessão que ele já abandonou.
    await this.provedores
      .sairDoWhatsapp(empresaId, alvo.sessaoId)
      .catch(() => undefined);

    const atualizada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.update({
        where: { id: alvo.sessaoId },
        data: {
          status: 'desconectada',
          credencialCifrada: null,
          updatedBy: user.id,
        },
      }),
    );
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

    const instancia = await this.provedores.iniciar(empresaId, sessao.id, {
      arquivarMensagens: config.historicoDias > 0,
    });
    await this.gravarInstancia(empresaId, sessao.id, instancia);

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
      .sairDoWhatsapp(empresaId, sessao.id)
      .catch(() => undefined);

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
   * O que fica do lado do provedor depende do transporte: no zapo, o material
   * técnico da sessão no store (chaves Signal, agenda) — o `DELETE` encerra o
   * cliente, mas a biblioteca não expõe expurgo, e não se afirma aqui o que
   * não se fez. Na Evolution GO, a instância é deslogada e apagada no gateway,
   * o que aqui sim descarta a credencial.
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
    if (conversas > 0) {
      throw new BadRequestException(
        `Esta instância tem ${conversas} ${conversas === 1 ? 'conversa' : 'conversas'} no histórico. ` +
          'Limpe as conversas antes de excluir.',
      );
    }

    // O provedor pode já não conhecer esta sessão (worker reiniciado,
    // instância nunca criada): o encerramento é melhor-esforço, e a linha some
    // deste lado de qualquer forma.
    await this.provedores
      .removerInstancia(empresaId, sessao.id)
      .catch(() => undefined);

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappSessao.delete({ where: { id: sessao.id } }),
    );
    return { excluida: true, vendedor: sessao.vendedor.nome, por: user.id };
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

    // O provedor responde com o tamanho do trabalho e segue entregando em
    // segundo plano: importar meses de conversa não cabe no timeout de uma
    // requisição. As conversas vão aparecendo na tela de Atendimento.
    const resultado = await this.provedores.importarHistorico(
      empresaId,
      sessao.id,
      config.historicoDias,
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
