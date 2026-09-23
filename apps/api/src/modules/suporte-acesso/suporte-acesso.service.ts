import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConcederSuporte } from '@plataforma/contracts';

@Injectable()
export class SuporteAcessoService {
  constructor(private readonly prisma: PrismaService) {}

  async concederAcesso(empresaId: string, input: ConcederSuporte, actorId: string) {
    const validoAte = new Date();
    validoAte.setHours(validoAte.getHours() + input.duracaoHoras);

    // Desativa concessões ativas anteriores se houver
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.updateMany({
        where: {
          empresaId,
          validoAte: { gt: new Date() },
          revogadoEm: null,
        },
        data: {
          revogadoEm: new Date(),
          revogadoPorId: actorId,
        },
      }),
    );

    const concessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.create({
        data: {
          empresaId,
          concedidoPorId: actorId,
          motivo: input.motivo,
          validoAte,
        },
        include: {
          concedidoPor: {
            select: { id: true, nome: true, email: true },
          },
        },
      }),
    );

    return concessao;
  }

  async revogarAcesso(empresaId: string, id: string, actorId: string) {
    const concessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.findFirst({
        where: { id, empresaId },
      }),
    );

    if (!concessao) {
      throw new NotFoundException('Concessão de acesso não encontrada');
    }

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.update({
        where: { id },
        data: {
          revogadoEm: new Date(),
          revogadoPorId: actorId,
        },
      }),
    );
  }

  async getAcessoAtivo(empresaId: string) {
    const agora = new Date();
    const concessao = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.findFirst({
        where: {
          empresaId,
          validoAte: { gt: agora },
          revogadoEm: null,
        },
        include: {
          concedidoPor: {
            select: { id: true, nome: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );

    return concessao;
  }

  async listHistorico(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.findMany({
        where: { empresaId },
        include: {
          concedidoPor: {
            select: { id: true, nome: true, email: true },
          },
          revogadoPor: {
            select: { id: true, nome: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listLogs(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteLog.findMany({
        where: { empresaId },
        include: {
          usuarioPlataforma: {
            select: { id: true, nome: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
  }

  async registrarLogSuporte(data: {
    empresaId: string;
    suporteAcessoId: string;
    usuarioPlataformaId: string;
    metodoHttp: string;
    rota: string;
    payload?: string;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.withTenant(data.empresaId, (tx) =>
      tx.empresaSuporteLog.create({
        data: {
          empresaId: data.empresaId,
          suporteAcessoId: data.suporteAcessoId,
          usuarioPlataformaId: data.usuarioPlataformaId,
          metodoHttp: data.metodoHttp,
          rota: data.rota,
          payload: data.payload,
          ip: data.ip,
          userAgent: data.userAgent,
        },
      }),
    );
  }

  /**
   * Verifica se existe concessão de acesso de suporte ativa para esta empresa.
   * Usado pelos Guards para impedir acesso não autorizado da Plataforma.
   */
  async validarAcessoSuporteAtivo(empresaId: string) {
    const agora = new Date();
    const concessao = await this.prisma.empresaSuporteAcesso.findFirst({
      where: {
        empresaId,
        validoAte: { gt: agora },
        revogadoEm: null,
      },
    });

    if (!concessao) {
      throw new ForbiddenException(
        'Acesso ao ambiente do cliente bloqueado. Solicite ao cliente a liberação de acesso de suporte.',
      );
    }

    return concessao;
  }
}
