import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PersonificacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async listLogs(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioPersonificacaoLog.findMany({
        where: { empresaId },
        include: {
          administrador: { select: { id: true, nome: true, email: true } },
          usuarioAlvo: { select: { id: true, nome: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
  }

  async registrarLog(data: {
    empresaId: string;
    administradorId: string;
    usuarioAlvoId: string;
    metodoHttp: string;
    rota: string;
    payload?: string;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.withTenant(data.empresaId, (tx) =>
      tx.usuarioPersonificacaoLog.create({ data }),
    );
  }
}
