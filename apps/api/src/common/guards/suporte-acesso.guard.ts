import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { SuporteAcessoService } from '../../modules/suporte-acesso/suporte-acesso.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuporteAcessoGuard implements CanActivate {
  constructor(
    private readonly suporteService: SuporteAcessoService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return true;

    // Usuários normais da empresa não dependem de liberação de suporte
    if (!user.administradorPlataforma) return true;

    const path = request.path || request.url;

    // Rotas globais da plataforma, autenticação e suporte não requerem liberação do tenant
    if (
      path.startsWith('/plataforma') ||
      path.startsWith('/auth') ||
      path.startsWith('/termos') ||
      path.startsWith('/tours') ||
      path.startsWith('/integracao')
    ) {
      return true;
    }

    // Se o usuário está navegando na própria empresa gestora da plataforma (ePlataforma = true), libera o acesso direto
    if (user.empresaAtivaId) {
      const empresa = await this.prisma.empresa.findUnique({
        where: { id: user.empresaAtivaId },
        select: { ePlataforma: true },
      });
      if (empresa?.ePlataforma) return true;

      // Em ambiente de cliente tenant (ePlataforma = false), exige concessão de suporte ativa e auditada
      const concessao = await this.suporteService.validarAcessoSuporteAtivo(user.empresaAtivaId);

      // Registrar o log de auditoria da ação do suporte no cliente
      const body = request.body ? JSON.stringify(request.body) : undefined;
      const payloadTruncated = body && body.length > 2000 ? body.substring(0, 2000) + '...' : body;

      await this.suporteService.registrarLogSuporte({
        empresaId: user.empresaAtivaId,
        suporteAcessoId: concessao.id,
        usuarioPlataformaId: user.id,
        metodoHttp: request.method,
        rota: path,
        payload: payloadTruncated,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'],
      });
    }

    return true;
  }
}
