import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CATALOGO_ENDPOINTS_INTEGRACAO,
  IntegracaoEndpointCatalogoItem,
} from './integracao-endpoints.catalogo';

export interface EndpointStatusItem extends IntegracaoEndpointCatalogoItem {
  ativo: boolean;
  ultimoUso: string | null;
  totalChamadas: number;
}

@Injectable()
export class IntegracaoEndpointsService {
  constructor(private readonly prisma: PrismaService) {}

  async listarEndpoints(empresaId: string): Promise<EndpointStatusItem[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const configs = await tx.integracaoEndpointConfig.findMany({
        where: { empresaId, deletedAt: null },
      });

      const configMap = new Map(configs.map((c) => [c.endpointKey, c]));

      return CATALOGO_ENDPOINTS_INTEGRACAO.map((item) => {
        const config = configMap.get(item.endpointKey);
        return {
          ...item,
          ativo: config ? config.ativo : true,
          ultimoUso: config?.ultimoUso ? config.ultimoUso.toISOString() : null,
          totalChamadas: config ? config.totalChamadas : 0,
        };
      });
    });
  }

  async alternarStatus(
    empresaId: string,
    endpointKey: string,
    ativo: boolean,
  ): Promise<EndpointStatusItem> {
    const itemCatalogo = CATALOGO_ENDPOINTS_INTEGRACAO.find(
      (c) => c.endpointKey === endpointKey,
    );
    if (!itemCatalogo) {
      throw new NotFoundException(`Endpoint '${endpointKey}' não encontrado`);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const config = await tx.integracaoEndpointConfig.upsert({
        where: {
          empresaId_endpointKey: {
            empresaId,
            endpointKey,
          },
        },
        create: {
          empresaId,
          endpointKey,
          nome: itemCatalogo.nome,
          ativo,
        },
        update: {
          ativo,
        },
      });

      return {
        ...itemCatalogo,
        ativo: config.ativo,
        ultimoUso: config.ultimoUso ? config.ultimoUso.toISOString() : null,
        totalChamadas: config.totalChamadas,
      };
    });
  }

  async registrarUsoEndpoint(empresaId: string, endpointKey: string): Promise<void> {
    const itemCatalogo = CATALOGO_ENDPOINTS_INTEGRACAO.find(
      (c) => c.endpointKey === endpointKey,
    );
    const nome = itemCatalogo ? itemCatalogo.nome : endpointKey;

    await this.prisma.integracaoEndpointConfig.upsert({
      where: {
        empresaId_endpointKey: {
          empresaId,
          endpointKey,
        },
      },
      create: {
        empresaId,
        endpointKey,
        nome,
        ativo: true,
        ultimoUso: new Date(),
        totalChamadas: 1,
      },
      update: {
        ultimoUso: new Date(),
        totalChamadas: { increment: 1 },
      },
    }).catch(() => undefined);
  }

  async isEndpointAtivo(empresaId: string, endpointKey: string): Promise<boolean> {
    const config = await this.prisma.integracaoEndpointConfig.findUnique({
      where: {
        empresaId_endpointKey: {
          empresaId,
          endpointKey,
        },
      },
      select: { ativo: true },
    });
    return config ? config.ativo : true;
  }
}
