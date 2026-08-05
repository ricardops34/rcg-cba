import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CAMPOS_CLIENTE_CONFIGURAVEIS,
  type ClienteCampoConfigItem,
  type ClienteCamposConfig,
} from '@plataforma/contracts';

@Injectable()
export class ClienteCampoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Campo sem linha configurada é considerado editável (rollout sem quebra). */
  async obterConfig(empresaId: string): Promise<ClienteCamposConfig> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linhas = await tx.clienteCampoConfig.findMany({
        where: { empresaId },
      });
      const porCampo = new Map(linhas.map((l) => [l.campo, l.editavel]));
      const config: ClienteCamposConfig = {};
      for (const campo of CAMPOS_CLIENTE_CONFIGURAVEIS) {
        config[campo] = porCampo.get(campo) ?? true;
      }
      return config;
    });
  }

  async atualizar(
    empresaId: string,
    userId: string,
    itens: ClienteCampoConfigItem[],
  ): Promise<ClienteCamposConfig> {
    await this.prisma.withTenant(empresaId, async (tx) => {
      for (const item of itens) {
        await tx.clienteCampoConfig.upsert({
          where: { empresaId_campo: { empresaId, campo: item.campo } },
          update: { editavel: item.editavel, updatedBy: userId },
          create: {
            empresaId,
            campo: item.campo,
            editavel: item.editavel,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      }
    });
    return this.obterConfig(empresaId);
  }
}
