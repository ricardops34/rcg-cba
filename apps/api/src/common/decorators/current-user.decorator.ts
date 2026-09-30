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
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
