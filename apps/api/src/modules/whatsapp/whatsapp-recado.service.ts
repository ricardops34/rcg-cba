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
import type {
  WhatsappRecadoCriar,
  WhatsappRecadoEditar,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** De quanto em quanto tempo a rotina procura recado vencido. */
const INTERVALO_MS = 60_000;

/** Quantos recados uma passagem despacha. */
const LOTE = 20;

/**
 * Recado interno pelo número da empresa e/ou notificação na plataforma.
 *
 * **Não é envio em massa para clientes.** Alcança exclusivamente a equipe de vendedores.
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
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ audiência

  async destinatarios(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);

      const vendedores = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
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
          enviarPlataforma: dto.enviarPlataforma ?? true,
          enviarWhatsapp: dto.enviarWhatsapp ?? true,
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

    if (!dto.enviarEm) await this.despachar(empresaId, recadoId);

    return this.obter(empresaId, recadoId);
  }

  // --------------------------------------------------------------- edição

  async editar(
    empresaId: string,
    user: AuthenticatedUser,
    recadoId: string,
    dto: WhatsappRecadoEditar,
  ) {
    if (dto.enviarEm && dto.enviarEm.getTime() < Date.now() - 60_000) {
      throw new BadRequestException(
        'A data de envio já passou. Escolha um horário à frente ou envie agora.',
      );
    }

    await this.prisma.withTenant(empresaId, async (tx) => {
      const recado = await tx.whatsappRecadoInterno.findFirst({
        where: { id: recadoId, criadoPor: user.id },
        select: { status: true },
      });
      if (!recado) throw new NotFoundException('Recado não encontrado');
      if (recado.status !== 'pendente') {
        throw new BadRequestException(
          'Só dá para editar recado que ainda não saiu.',
        );
      }

      let alvos: { id: string; nome: string; telefone: string | null }[] | undefined;
      if (dto.vendedorIds) {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);
        alvos = await tx.vendedor.findMany({
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
            'Nenhum destinatário válido selecionado.',
          );
        }
      }

      await tx.whatsappRecadoInterno.update({
        where: { id: recadoId },
        data: {
          ...(dto.texto !== undefined ? { texto: dto.texto.trim() } : {}),
          ...(dto.enviarEm !== undefined ? { enviarEm: dto.enviarEm } : {}),
          ...(dto.enviarPlataforma !== undefined
            ? { enviarPlataforma: dto.enviarPlataforma }
            : {}),
          ...(dto.enviarWhatsapp !== undefined
            ? { enviarWhatsapp: dto.enviarWhatsapp }
            : {}),
        },
      });

      if (alvos) {
        await tx.whatsappRecadoDestinatario.deleteMany({
          where: { recadoId },
        });
        await tx.whatsappRecadoDestinatario.createMany({
          data: alvos.map((v) => ({
            empresaId,
            recadoId,
            vendedorId: v.id,
            nome: v.nome,
            telefone: v.telefone,
          })),
        });
      }
    });

    if (
      dto.enviarEm === null ||
      (dto.enviarEm && dto.enviarEm.getTime() <= Date.now())
    ) {
      await this.despachar(empresaId, recadoId);
    }

    return this.obter(empresaId, recadoId);
  }

  // -------------------------------------------------------------- consulta

  async listar(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const recados = await tx.whatsappRecadoInterno.findMany({
        where: { empresaId, criadoPor: user.id },
        orderBy: { criadoEm: 'desc' },
        take: 50,
        include: { destinatarios: { orderBy: { nome: 'asc' } } },
      });
      return recados.map((r) => this.formatar(r));
    });
  }

  async listarRecebidos(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { empresaId, usuarioId: user.id, deletedAt: null },
        select: { id: true },
      });

      const destinatarios = await tx.whatsappRecadoDestinatario.findMany({
        where: {
          empresaId,
          ...(vendedor
            ? { vendedorId: vendedor.id }
            : { recado: { criadoPor: user.id } }),
          status: { in: ['enviada', 'pendente'] },
        },
        orderBy: { recado: { criadoEm: 'desc' } },
        take: 50,
        include: {
          recado: true,
        },
      });

      return destinatarios.map((d) => ({
        id: d.id,
        recadoId: d.recado.id,
        texto: d.recado.texto,
        criadoPorNome: d.recado.criadoPorNome,
        criadoEm: d.recado.criadoEm.toISOString(),
        enviarEm: d.recado.enviarEm?.toISOString() ?? null,
        lidoEm: d.lidoEm?.toISOString() ?? null,
        enviadoEm: d.enviadoEm?.toISOString() ?? null,
        enviarPlataforma: d.recado.enviarPlataforma,
        enviarWhatsapp: d.recado.enviarWhatsapp,
      }));
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

  async marcarLido(
    empresaId: string,
    user: AuthenticatedUser,
    recadoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { empresaId, usuarioId: user.id, deletedAt: null },
        select: { id: true },
      });

      const agora = new Date();

      await tx.whatsappRecadoDestinatario.updateMany({
        where: {
          recadoId,
          ...(vendedor ? { vendedorId: vendedor.id } : {}),
          lidoEm: null,
        },
        data: { lidoEm: agora },
      });

      await tx.notificacao.updateMany({
        where: {
          empresaId,
          usuarioId: user.id,
          referenciaId: recadoId,
          tipo: 'recado_interno',
          lidaEm: null,
        },
        data: { lidaEm: agora },
      });

      return { lido: true, lidoEm: agora.toISOString() };
    });
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
    enviarPlataforma: boolean;
    enviarWhatsapp: boolean;
    status: string;
    criadoPorNome: string;
    criadoEm: Date;
    destinatarios: {
      nome: string;
      telefone: string | null;
      status: string;
      erro: string | null;
      enviadoEm: Date | null;
      lidoEm: Date | null;
    }[];
  }) {
    return {
      id: recado.id,
      texto: recado.texto,
      enviarEm: recado.enviarEm?.toISOString() ?? null,
      enviarPlataforma: recado.enviarPlataforma,
      enviarWhatsapp: recado.enviarWhatsapp,
      status: recado.status,
      criadoPorNome: recado.criadoPorNome,
      criadoEm: recado.criadoEm.toISOString(),
      destinatarios: recado.destinatarios.map((d) => ({
        nome: d.nome,
        telefone: d.telefone,
        status: d.status,
        erro: d.erro,
        enviadoEm: d.enviadoEm?.toISOString() ?? null,
        lidoEm: d.lidoEm?.toISOString() ?? null,
      })),
      enviados: recado.destinatarios.filter((d) => d.status === 'enviada')
        .length,
      falhas: recado.destinatarios.filter((d) => d.status === 'erro').length,
    };
  }

  // --------------------------------------------------------------- despacho

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

  private async despachar(empresaId: string, recadoId: string) {
    try {
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

      // Se a opção de Plataforma estiver marcada, gera as notificações no sino
      if (dados.enviarPlataforma) {
        await this.prisma.withTenant(empresaId, async (tx) => {
          for (const destino of dados.destinatarios) {
            const vendedor = await tx.vendedor.findUnique({
              where: { id: destino.vendedorId },
              select: { usuarioId: true },
            });
            if (vendedor?.usuarioId) {
              await tx.notificacao.create({
                data: {
                  empresaId,
                  usuarioId: vendedor.usuarioId,
                  tipo: 'recado_interno',
                  titulo: `Recado de ${dados.criadoPorNome}`,
                  descricao:
                    dados.texto.length > 120
                      ? dados.texto.slice(0, 117) + '...'
                      : dados.texto,
                  referenciaId: recadoId,
                  rota: '/gerencial/recados',
                  ocorridaEm: new Date(),
                },
              });
            }
          }
        });
      }

      // Se Enviar WhatsApp estiver desmarcado, encerra o despacho marcando destinatários como enviada
      if (!dados.enviarWhatsapp) {
        await this.prisma.withTenant(empresaId, (tx) =>
          tx.whatsappRecadoDestinatario.updateMany({
            where: { recadoId, status: 'pendente' },
            data: { status: 'enviada', enviadoEm: new Date() },
          }),
        );
        await this.encerrar(empresaId, recadoId, 'enviada');
        return;
      }

      // Caso contrário, faz o envio via WhatsApp
      const sessao = await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappSessao.findFirst({
          where: { empresaId, tipo: 'empresa', status: 'conectada' },
          select: { id: true },
        }),
      );

      if (!sessao) {
        // Se também enviou pela plataforma, mantém o status do recado como enviada mas indica o erro do WhatsApp nos destinatários
        await this.encerrar(
          empresaId,
          recadoId,
          dados.enviarPlataforma ? 'enviada' : 'erro',
        );
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
