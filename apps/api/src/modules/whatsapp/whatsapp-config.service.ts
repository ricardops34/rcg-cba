import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { WhatsappConfigUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Configuração do WhatsApp por empresa (singleton, padrão do AgenteConfig e
 * do OrcamentoConfig): upsert preguiçoso no primeiro acesso, para a tela nunca
 * precisar tratar "ainda não existe".
 *
 * Aqui fica o que é decisão da empresa — transporte, endereço do worker e
 * retenção. O que é do vendedor (o número conectado) mora em WhatsappSessao.
 */
@Injectable()
export class WhatsappConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConfig.upsert({
        where: { empresaId },
        create: { empresaId },
        update: {},
      }),
    );
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    input: WhatsappConfigUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await tx.whatsappConfig.upsert({
        where: { empresaId },
        create: { empresaId },
        update: {},
      });
      return tx.whatsappConfig.update({
        where: { empresaId },
        data: { ...input, updatedBy: user.id },
      });
    });
  }
}
