import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TenantTx } from '../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { jidBrasileiro } from './triagem/telefone-equipe';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type { WhatsappRecadoCriar } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** De quanto em quanto tempo a rotina procura recado vencido. */
const INTERVALO_MS = 60_000;

/** Quantos recados uma passagem despacha. */
const LOTE = 20;

/**
 * Recado interno pelo número da empresa.
 *
 * **Não é envio em massa, e a diferença não é de tamanho.** Ele alcança
 * exclusivamente quem tem cadastro de vendedor — a equipe. Cliente continua
 * recebendo na conversa individual, onde alguém escreve para alguém. Foi
 * decisão do usuário: envio em massa não existe nesta plataforma.
 *
 * Como o agendamento de conversa, **é autorizado na criação**: o escopo de
 * quem envia é resolvido ali, com o usuário logado. Na hora do despacho não há
 * requisição nem sessão, e refazer a verificação significaria reconstruir
 * permissão a partir do nada — o envio confia no que já foi conferido e apenas
 * registra o resultado por pessoa.
 */
@Injectable()
export class WhatsappRecadoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappRecadoService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: WhatsappProviderService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.despacharVencidos(), INTERVALO_MS);
    // `unref` para o timer não segurar o processo no encerramento.
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ audiência

  /**
   * Quem esta pessoa pode alcançar.
   *
   * É o mesmo escopo hierárquico do resto do sistema: vendedor alcança a si
   * mesmo, quem tem gente abaixo alcança a equipe. Não existe "todo mundo"
   * para quem não teria acesso a todo mundo nas outras telas — o WhatsApp não
   * pode ser a porta larga ao lado da porta estreita.
   */
  async destinatarios(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);

      const vendedores = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          // `sistema` não é gente (ESCRITORIO, E-COMMERCE, balcão): tem
          // cadastro para receber nota no ERP, não para receber recado.
          vinculo: { not: 'sistema' },
          ...(escopo === null ? {} : { id: { in: escopo } }),
        },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, telefone: true },
      });

      const comEquipe = await tx.vendedor.groupBy({
        by: ['superiorId'],
        where: { empresaId, deletedAt: null, superiorId: { not: null } },
      });
      const superiores = new Set(comEquipe.map((v) => v.superiorId));

      return vendedores.map((v) => ({
        vendedorId: v.id,
        nome: v.nome,
        telefone: v.telefone,
        // A tela mostra quem não tem telefone, desmarcado e com o motivo:
        // esconder faria "mandei para a equipe" omitir quem ficou de fora.
        alcancavel: jidBrasileiro(v.telefone) !== null,
        superior: superiores.has(v.id),
      }));
    });
  }

  // --------------------------------------------------------------- criação

  async criar(
    empresaId: string,
    user: AuthenticatedUser,
    dto: WhatsappRecadoCriar,
  ) {
    if (dto.enviarEm && dto.enviarEm.getTime() < Date.now() - 60_000) {
      throw new BadRequestException(
        'A data de envio já passou. Escolha um horário à frente ou envie agora.',
      );
    }

    const recadoId = await this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);

      // O escopo é conferido **aqui**, contra os ids que vieram da tela: sem
      // isto, bastaria mandar outro id no corpo da requisição para escrever no
      // WhatsApp de quem não é da equipe.
      const alvos = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          vinculo: { not: 'sistema' },
          id: {
            in:
              escopo === null
                ? dto.vendedorIds
                : dto.vendedorIds.filter((id) => escopo.includes(id)),
          },
        },
        select: { id: true, nome: true, telefone: true },
      });

      if (alvos.length === 0) {
        throw new BadRequestException(
          'Nenhum destinatário válido: os escolhidos não estão na sua equipe ou não estão ativos.',
        );
      }

      const recado = await tx.whatsappRecadoInterno.create({
        data: {
          empresaId,
          texto: dto.texto.trim(),
          enviarEm: dto.enviarEm ?? null,
          criadoPor: user.id,
          criadoPorNome: user.nome,
          destinatarios: {
            create: alvos.map((v) => ({
              empresaId,
              vendedorId: v.id,
              nome: v.nome,
              telefone: v.telefone,
            })),
          },
        },
        select: { id: true },
      });

      return recado.id;
    });

    // Sem data marcada, sai agora — mas fora da transação: o envio fala com o
    // provedor pela rede, e segurar a transação durante isso prenderia uma
    // conexão do pool por segundos.
    if (!dto.enviarEm) await this.despachar(empresaId, recadoId);

    return this.obter(empresaId, recadoId);
  }

  // -------------------------------------------------------------- consulta

  async listar(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const recados = await tx.whatsappRecadoInterno.findMany({
        // Cada um vê o que escreveu. O recado é do autor, e uma lista com o
        // que todo mundo mandou seria outra tela, com outra permissão.
        where: { empresaId, criadoPor: user.id },
        orderBy: { criadoEm: 'desc' },
        take: 50,
        include: { destinatarios: { orderBy: { nome: 'asc' } } },
      });
      return recados.map((r) => this.formatar(r));
    });
  }

  async obter(empresaId: string, recadoId: string) {
    const recado = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappRecadoInterno.findFirst({
        where: { id: recadoId },
        include: { destinatarios: { orderBy: { nome: 'asc' } } },
      }),
    );
    if (!recado) throw new NotFoundException('Recado não encontrado');
    return this.formatar(recado);
  }

  async cancelar(empresaId: string, user: AuthenticatedUser, recadoId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const recado = await tx.whatsappRecadoInterno.findFirst({
        where: { id: recadoId, criadoPor: user.id },
        select: { status: true },
      });
      if (!recado) throw new NotFoundException('Recado não encontrado');
      if (recado.status !== 'pendente') {
        throw new BadRequestException(
          'Só dá para cancelar recado que ainda não saiu.',
        );
      }
      await tx.whatsappRecadoInterno.update({
        where: { id: recadoId },
        data: { status: 'cancelada' },
      });
      await tx.whatsappRecadoDestinatario.updateMany({
        where: { recadoId, status: 'pendente' },
        data: { status: 'cancelada' },
      });
      return { cancelado: true };
    });
  }

  private formatar(recado: {
    id: string;
    texto: string;
    enviarEm: Date | null;
    status: string;
    criadoPorNome: string;
    criadoEm: Date;
    destinatarios: {
      nome: string;
      telefone: string | null;
      status: string;
      erro: string | null;
      enviadoEm: Date | null;
    }[];
  }) {
    return {
      id: recado.id,
      texto: recado.texto,
      enviarEm: recado.enviarEm?.toISOString() ?? null,
      status: recado.status,
      criadoPorNome: recado.criadoPorNome,
      criadoEm: recado.criadoEm.toISOString(),
      destinatarios: recado.destinatarios.map((d) => ({
        nome: d.nome,
        telefone: d.telefone,
        status: d.status,
        erro: d.erro,
        enviadoEm: d.enviadoEm?.toISOString() ?? null,
      })),
      enviados: recado.destinatarios.filter((d) => d.status === 'enviada')
        .length,
      falhas: recado.destinatarios.filter((d) => d.status === 'erro').length,
    };
  }

  // --------------------------------------------------------------- despacho

  /**
   * Recados agendados que já venceram.
   *
   * Percorre empresa a empresa porque as tabelas têm RLS: uma consulta sem
   * tenant no contexto volta vazia, por desenho.
   */
  private async despacharVencidos() {
    try {
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });

      for (const { id: empresaId } of empresas) {
        const vencidos = await this.prisma.withTenant(empresaId, (tx) =>
          tx.whatsappRecadoInterno.findMany({
            where: {
              empresaId,
              status: 'pendente',
              enviarEm: { not: null, lte: new Date() },
            },
            take: LOTE,
            select: { id: true },
          }),
        );
        for (const { id } of vencidos) {
          await this.despachar(empresaId, id);
        }
      }
    } catch (erro) {
      this.logger.error(`Falha na varredura de recados internos: ${erro}`);
    }
  }

  /**
   * Manda o recado a cada destinatário.
   *
   * **Uma falha não impede as outras**: quem não tem telefone, ou cujo envio
   * deu erro, fica marcado com o motivo e o resto segue. Um recado que não sai
   * para ninguém porque a primeira pessoa não tinha celular seria o pior dos
   * resultados — e o mais difícil de perceber.
   */
  private async despachar(empresaId: string, recadoId: string) {
    try {
      // `updateMany` com o status no filtro é o que evita dois despachos
      // simultâneos (a varredura e o envio imediato) mandarem em duplicidade:
      // só quem conseguir mudar de `pendente` para `enviando` segue.
      const assumido = await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappRecadoInterno.updateMany({
          where: { id: recadoId, status: 'pendente' },
          data: { status: 'enviando' },
        }),
      );
      if (assumido.count === 0) return;

      const dados = await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappRecadoInterno.findFirst({
          where: { id: recadoId },
          include: { destinatarios: true },
        }),
      );
      if (!dados) return;

      const sessao = await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappSessao.findFirst({
          where: { empresaId, tipo: 'empresa', status: 'conectada' },
          select: { id: true },
        }),
      );

      if (!sessao) {
        await this.encerrar(empresaId, recadoId, 'erro');
        await this.prisma.withTenant(empresaId, (tx) =>
          tx.whatsappRecadoDestinatario.updateMany({
            where: { recadoId, status: 'pendente' },
            data: {
              status: 'erro',
              erro: 'O número da empresa não está conectado',
            },
          }),
        );
        return;
      }

      const assinatura = `*${dados.criadoPorNome}* (pelo sistema):\n`;

      for (const destino of dados.destinatarios) {
        if (destino.status !== 'pendente') continue;

        const jid = jidBrasileiro(destino.telefone);
        if (!jid) {
          await this.marcarDestino(empresaId, destino.id, {
            status: 'erro',
            erro: 'Sem telefone utilizável no cadastro de vendedores',
          });
          continue;
        }

        try {
          await this.prisma.withTenant(empresaId, (tx) =>
            this.provider.enviarTexto(
              empresaId,
              sessao.id,
              { jid, texto: assinatura + dados.texto },
              tx,
            ),
          );
          await this.marcarDestino(empresaId, destino.id, {
            status: 'enviada',
            enviadoEm: new Date(),
          });
        } catch (erro) {
          await this.marcarDestino(empresaId, destino.id, {
            status: 'erro',
            erro: erro instanceof Error ? erro.message : String(erro),
          });
        }
      }

      await this.encerrar(empresaId, recadoId, 'enviada');
    } catch (erro) {
      this.logger.error(`Falha ao despachar recado ${recadoId}: ${erro}`);
      // Nada some em silêncio: o recado fica marcado como erro e visível na
      // tela de quem o escreveu.
      await this.encerrar(empresaId, recadoId, 'erro').catch(() => undefined);
    }
  }

  private async marcarDestino(
    empresaId: string,
    destinoId: string,
    data: { status: 'enviada' | 'erro'; erro?: string; enviadoEm?: Date },
  ) {
    await this.prisma.withTenant(empresaId, (tx: TenantTx) =>
      tx.whatsappRecadoDestinatario.update({ where: { id: destinoId }, data }),
    );
  }

  private async encerrar(
    empresaId: string,
    recadoId: string,
    status: 'enviada' | 'erro',
  ) {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappRecadoInterno.updateMany({
        where: { id: recadoId },
        data: { status },
      }),
    );
  }
}
