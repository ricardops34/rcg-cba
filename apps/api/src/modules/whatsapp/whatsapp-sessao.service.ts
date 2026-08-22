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
        corpo: { sessaoId: sessao.id, empresaId, transporte: config.transporte },
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
      const escopo = await this.escopoLeitura(tx, empresaId, user);
      const sessoes = await tx.whatsappSessao.findMany({
        where: escopo === null ? {} : { vendedorId: { in: escopo } },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      return sessoes.map((s) => this.paraLeitura(s, s.vendedor.nome));
    });
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
