import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../parametros/parametros.service';

export const PARAMETRO_DIAS_VALIDADE = 'ORCAMENTO_DIAS_VALIDADE';
const DIAS_VALIDADE_PADRAO = 30;

/**
 * Validade sugerida do orçamento. O valor mora em Parâmetros
 * (ORCAMENTO_DIAS_VALIDADE), editável em Administração > Parâmetros — aqui
 * ficou só a leitura, porque o formulário de Orçamento precisa dela e quem o
 * usa (vendedor) não tem acesso à tela de Parâmetros.
 */
@Injectable()
export class OrcamentoConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  async getVigente(empresaId: string) {
    const diasValidade = await this.parametros.obterNumero(
      empresaId,
      PARAMETRO_DIAS_VALIDADE,
      DIAS_VALIDADE_PADRAO,
    );
    const parametro = await this.prisma.withTenant(empresaId, (tx) =>
      tx.parametroEmpresa.findFirst({
        where: { empresaId, parametro: PARAMETRO_DIAS_VALIDADE },
        select: { updatedAt: true },
      }),
    );
    return { diasValidade, updatedAt: parametro?.updatedAt ?? new Date() };
  }
}
