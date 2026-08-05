import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface IntegracaoContext {
  empresaId: string;
  apiKeyId: string;
}

interface RequestComIntegracao extends Request {
  integracao?: IntegracaoContext;
}

/** Evita um UPDATE por requisição — só grava `ultimoUso` no máximo 1×/min por chave. */
const ULTIMO_USO_THROTTLE_MS = 60_000;

/**
 * Autenticação da API de integração ERP: só o header `x-api-key`, nunca JWT.
 * `integracao_api_keys` não tem RLS de propósito (ver migrations/README.md)
 * — é essa consulta por `chaveHash` que descobre a empresa da requisição,
 * então roda fora de `withTenant`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComIntegracao>();
    const chave = request.header('x-api-key');
    if (!chave)
      throw new UnauthorizedException(
        'Chave de API ausente (header x-api-key)',
      );

    const chaveHash = createHash('sha256').update(chave).digest('hex');
    const apiKey = await this.prisma.integracaoApiKey.findUnique({
      where: { chaveHash },
    });

    if (!apiKey || apiKey.deletedAt || !apiKey.ativo) {
      throw new UnauthorizedException('Chave de API inválida ou revogada');
    }
    if (apiKey.expiraEm && apiKey.expiraEm.getTime() < Date.now()) {
      throw new UnauthorizedException('Chave de API expirada');
    }

    request.integracao = { empresaId: apiKey.empresaId, apiKeyId: apiKey.id };

    const semRegistroRecente =
      !apiKey.ultimoUso ||
      Date.now() - apiKey.ultimoUso.getTime() > ULTIMO_USO_THROTTLE_MS;
    if (semRegistroRecente) {
      // Fire-and-forget: não atrasa a resposta nem derruba a requisição se falhar.
      void this.prisma.integracaoApiKey
        .update({ where: { id: apiKey.id }, data: { ultimoUso: new Date() } })
        .catch(() => undefined);
    }

    return true;
  }
}
