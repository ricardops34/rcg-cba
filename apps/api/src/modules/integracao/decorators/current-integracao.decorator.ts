import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { IntegracaoContext } from '../guards/api-key.guard';

export const CurrentIntegracao = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IntegracaoContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { integracao: IntegracaoContext }>();
    return request.integracao;
  },
);
