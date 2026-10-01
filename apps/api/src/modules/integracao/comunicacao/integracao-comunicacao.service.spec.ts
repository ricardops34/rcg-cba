import { PrismaService } from '../../../common/prisma/prisma.service';
import { IntegracaoComunicacaoService } from './integracao-comunicacao.service';

describe('IntegracaoComunicacaoService', () => {
  it('grava a hora do servidor em ULTIMA_COMUNICACAO_ERP da empresa da chave', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const tx = { parametroEmpresa: { upsert } };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const service = new IntegracaoComunicacaoService(
      prisma as unknown as PrismaService,
    );

    const antes = Date.now();
    const { ultimaComunicacao } = await service.registrar(
      'empresa-1',
      'chave-1',
    );

    expect(prisma.withTenant).toHaveBeenCalledWith(
      'empresa-1',
      expect.any(Function),
    );
    expect(new Date(ultimaComunicacao).getTime()).toBeGreaterThanOrEqual(antes);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          empresaId_parametro: {
            empresaId: 'empresa-1',
            parametro: 'ULTIMA_COMUNICACAO_ERP',
          },
        },
        create: expect.objectContaining({
          tipo: 'data',
          conteudo: ultimaComunicacao,
        }) as unknown,
        update: expect.objectContaining({
          conteudo: ultimaComunicacao,
          updatedBy: 'integracao:chave-1',
        }) as unknown,
      }),
    );
  });
});
