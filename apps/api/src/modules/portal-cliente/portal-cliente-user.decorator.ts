import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PortalClienteUser } from './portal-cliente-auth.types';

export const CurrentPortalCliente = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PortalClienteUser =>
    context.switchToHttp().getRequest<{ user: PortalClienteUser }>().user,
);
