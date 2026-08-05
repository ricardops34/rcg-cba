import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OrcamentoConfigUpdate } from '@plataforma/contracts';

const DIAS_VALIDADE_PADRAO = 30;

@Injectable()
export class OrcamentoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lê o parâmetro vigente, criando a linha singleton da empresa com o
   * default na primeira chamada (upsert idempotente — não depende de seed
   * rodar antes), mesmo padrão de PoliticaSenhaService.getVigente.
   */
  async getVigente(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.orcamentoConfig.upsert({
        where: { empresaId },
        update: {},
        create: { empresaId, diasValidade: DIAS_VALIDADE_PADRAO },
      }),
    );
  }

  async update(
    empresaId: string,
    input: OrcamentoConfigUpdate,
    actorId: string,
  ) {
    await this.getVigente(empresaId);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.orcamentoConfig.update({
        where: { empresaId },
        data: { ...input, updatedBy: actorId },
      }),
    );
  }
}
