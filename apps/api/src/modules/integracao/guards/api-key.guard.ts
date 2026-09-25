import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CATALOGO_ENDPOINTS_INTEGRACAO } from '../../integracao-keys/integracao-endpoints.catalogo';

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

    const path = request.originalUrl || request.url;
    const method = request.method.toUpperCase();

    // Validação de endpoint ativado/desativado no monitor por empresa
    const match = path.match(/\/integracao\/([a-z0-9-]+)/i);
    const endpointKey = match ? match[1] : null;

    if (endpointKey) {
      const endpointConfig = await this.prisma.integracaoEndpointConfig.findUnique({
        where: {
          empresaId_endpointKey: {
            empresaId: apiKey.empresaId,
            endpointKey,
          },
        },
      });

      if (endpointConfig && !endpointConfig.ativo) {
        throw new ForbiddenException(
          `O endpoint '/integracao/${endpointKey}' está desativado para esta empresa.`,
        );
      }
    }

    const isEnvio =
      path.includes('/orcamentos/pendentes') ||
      path.includes('/arquivo/exportar');

    const isColeta =
      !isEnvio &&
      (method === 'POST' ||
        method === 'PUT' ||
        method === 'PATCH' ||
        method === 'DELETE' ||
        path.includes('/arquivo/importar'));

    const agora = new Date();
    const dataUpdate: {
      ultimoUso: Date;
      ultimaColeta?: Date;
      ultimoEnvio?: Date;
    } = {
      ultimoUso: agora,
    };

    if (isColeta) {
      dataUpdate.ultimaColeta = agora;
    } else if (isEnvio) {
      dataUpdate.ultimoEnvio = agora;
    }

    const semRegistroRecente =
      !apiKey.ultimoUso ||
      agora.getTime() - apiKey.ultimoUso.getTime() > ULTIMO_USO_THROTTLE_MS ||
      (isColeta && !apiKey.ultimaColeta) ||
      (isEnvio && !apiKey.ultimoEnvio);

    if (semRegistroRecente) {
      // Fire-and-forget: não atrasa a resposta nem derruba a requisição se falhar.
      void this.prisma.integracaoApiKey
        .update({ where: { id: apiKey.id }, data: dataUpdate })
        .catch(() => undefined);
    }

    // Registra estatística de uso por endpoint
    if (endpointKey) {
      const itemCatalogo = CATALOGO_ENDPOINTS_INTEGRACAO.find(
        (c) => c.endpointKey === endpointKey,
      );
      const nome = itemCatalogo ? itemCatalogo.nome : endpointKey;

      void this.prisma.integracaoEndpointConfig
        .upsert({
          where: {
            empresaId_endpointKey: {
              empresaId: apiKey.empresaId,
              endpointKey,
            },
          },
          create: {
            empresaId: apiKey.empresaId,
            endpointKey,
            nome,
            ativo: true,
            ultimoUso: agora,
            totalChamadas: 1,
          },
          update: {
            ultimoUso: agora,
            totalChamadas: { increment: 1 },
          },
        })
        .catch(() => undefined);
    }

    return true;
  }
}
