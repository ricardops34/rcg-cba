import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CAMPOS_CLIENTE_CONFIGURAVEIS,
  MODOS_CAMPO_CLIENTE,
  type ClienteCampoConfigItem,
  type ClienteCamposConfig,
  type ModoCampoCliente,
} from '@plataforma/contracts';

const modoValido = (v: string): v is ModoCampoCliente =>
  (MODOS_CAMPO_CLIENTE as readonly string[]).includes(v);

@Injectable()
export class ClienteCampoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Campo sem linha configurada é considerado editável (rollout sem quebra). */
  async obterConfig(empresaId: string): Promise<ClienteCamposConfig> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linhas = await tx.clienteCampoConfig.findMany({
        where: { empresaId },
      });
      const porCampo = new Map(
        linhas.map((l) => [l.campo, modoValido(l.modo) ? l.modo : 'permitir']),
      );
      const config: ClienteCamposConfig = {};
      for (const campo of CAMPOS_CLIENTE_CONFIGURAVEIS) {
        config[campo] = porCampo.get(campo) ?? 'permitir';
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
        const editavel = item.modo === 'permitir';
        await tx.clienteCampoConfig.upsert({
          where: { empresaId_campo: { empresaId, campo: item.campo } },
          update: { modo: item.modo, editavel, updatedBy: userId },
          create: {
            empresaId,
            campo: item.campo,
            modo: item.modo,
            editavel,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      }
    });
    return this.obterConfig(empresaId);
  }
}
