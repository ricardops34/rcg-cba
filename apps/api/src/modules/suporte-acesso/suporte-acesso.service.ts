import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConcederSuporte } from '@plataforma/contracts';

@Injectable()
export class SuporteAcessoService {
  constructor(private readonly prisma: PrismaService) {}

  async concederAcesso(
    empresaId: string,
    input: ConcederSuporte,
    actorId: string,
  ) {
    const validoAte = new Date();
    validoAte.setHours(validoAte.getHours() + input.duracaoHoras);

    // Uma vigente por vez: revoga as anteriores e cria a nova na mesma
    // transação (antes eram duas, e dois pedidos juntos deixavam duas
    // vigentes).
    return this.prisma.withTenant(empresaId, async (tx) => {
      await tx.empresaSuporteAcesso.updateMany({
        where: {
          empresaId,
          validoAte: { gt: new Date() },
          revogadoEm: null,
        },
        data: {
          revogadoEm: new Date(),
          revogadoPorId: actorId,
        },
      });
      return tx.empresaSuporteAcesso.create({
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
      });
    });
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
    // Já encerrada: revogar de novo apagaria quem revogou e quando.
    if (concessao.revogadoEm || concessao.validoAte <= new Date()) {
      throw new ConflictException('Esta liberação já está encerrada.');
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
    const logs = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteLog.findMany({
        where: { empresaId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
    // Quem agiu é da plataforma, outro grupo econômico: `usuarios` tem RLS por
    // grupo, e o `include` voltava nulo para o cliente — "Inconsistent query
    // result" assim que o primeiro log existiu. Modo sistema só para o nome e
    // o e-mail de quem atuou no ambiente dele, que é o que a tela existe para
    // mostrar (operação já autorizada: rota da empresa ativa, com permissão).
    const ids = [...new Set(logs.map((l) => l.usuarioPlataformaId))];
    const usuarios = ids.length
      ? await this.prisma.withSistema((tx) =>
          tx.usuario.findMany({
            where: { id: { in: ids } },
            select: { id: true, nome: true, email: true },
          }),
        )
      : [];
    const porId = new Map(usuarios.map((u) => [u.id, u]));
    return logs.map((l) => ({
      ...l,
      usuarioPlataforma: porId.get(l.usuarioPlataformaId) ?? null,
    }));
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
   * A liberação vigente da empresa, ou null. Lida no contexto da empresa
   * (`empresa_suporte_acessos` tem RLS): roda também na renovação do token,
   * que não tem usuário logado.
   */
  concessaoVigente(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaSuporteAcesso.findFirst({
        where: { empresaId, validoAte: { gt: new Date() }, revogadoEm: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /**
   * Verifica se existe concessão de acesso de suporte ativa para esta empresa.
   * Usado pela sessão de suporte para impedir acesso sem liberação.
   */
  async validarAcessoSuporteAtivo(empresaId: string) {
    const concessao = await this.concessaoVigente(empresaId);

    if (!concessao) {
      throw new ForbiddenException(
        'Acesso ao ambiente do cliente bloqueado. Solicite ao cliente a liberação de acesso de suporte.',
      );
    }

    return concessao;
  }
}
