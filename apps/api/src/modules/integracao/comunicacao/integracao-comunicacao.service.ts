import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PARAMETRO_ULTIMA_COMUNICACAO_ERP } from '../../parametros/parametros.service';
import { autorIntegracao } from '../common/autor-integracao';

/**
 * Batimento do ERP: no fim de cada execução de envio e de retorno, o
 * integrador avisa que passou por aqui, e a hora fica no parâmetro
 * ULTIMA_COMUNICACAO_ERP da empresa (Administração > Parâmetros).
 *
 * A hora é a do servidor da plataforma, não a do Protheus: um relógio só,
 * comparável com o de quem olha a tela.
 */
@Injectable()
export class IntegracaoComunicacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    empresaId: string,
    apiKeyId: string,
  ): Promise<{ ultimaComunicacao: string }> {
    const autor = autorIntegracao(apiKeyId);
    const agora = new Date().toISOString();
    await this.prisma.withTenant(empresaId, (tx) =>
      // Upsert: a empresa criada depois da migration, ou que apagou a linha
      // pela tela, volta a ter o parâmetro na primeira comunicação.
      tx.parametroEmpresa.upsert({
        where: {
          empresaId_parametro: {
            empresaId,
            parametro: PARAMETRO_ULTIMA_COMUNICACAO_ERP,
          },
        },
        create: {
          empresaId,
          parametro: PARAMETRO_ULTIMA_COMUNICACAO_ERP,
          tipo: 'data',
          conteudo: agora,
          descricao:
            'Data e hora da última comunicação do ERP com a plataforma (gravada pela integração)',
          createdBy: autor,
          updatedBy: autor,
        },
        update: {
          conteudo: agora,
          deletedAt: null,
          deletedBy: null,
          updatedBy: autor,
        },
      }),
    );
    return { ultimaComunicacao: agora };
  }
}
