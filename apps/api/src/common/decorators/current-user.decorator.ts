import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  nome: string;
  email: string;
  empresaAtivaId: string;
  isAdmin: boolean;
  administradorPlataforma?: boolean;
  permissoes: string[];
  /** Sessão do login (tabela `sessoes`) — ausente em token emitido antes dela. */
  sessaoId?: string;
  /**
   * Sessão de suporte da plataforma no ambiente de um cliente, sem vínculo: a
   * liberação dele (`empresa_suporte_acessos`) que a autoriza.
   */
  suporteAcessoId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
