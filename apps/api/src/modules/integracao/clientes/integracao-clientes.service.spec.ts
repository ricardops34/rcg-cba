import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClienteAlteracoesService } from '../../clientes/cliente-alteracoes.service';
import { IntegracaoClientesService } from './integracao-clientes.service';

describe('IntegracaoClientesService', () => {
  it('trata tabelaPrecoChave "-" como ausência de vínculo', async () => {
    const criadoEm = new Date('2026-09-24T12:00:00.000Z');
    const tx = {
      cliente: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              ...data,
              id: 'cliente-1',
              vendedor: null,
              tabelaPreco: null,
              condicaoPagamento: null,
              createdAt: criadoEm,
              updatedAt: criadoEm,
              createdBy: data.createdBy,
            }),
          ),
      },
      tabelaPreco: {
        findFirst: jest.fn(),
      },
    };
    const prisma = {
      withTenant: jest.fn(
        (_empresaId: string, executar: (tenant: typeof tx) => unknown) =>
          executar(tx),
      ),
    };
    const service = new IntegracaoClientesService(
      prisma as unknown as PrismaService,
      {} as ClienteAlteracoesService,
    );

    await expect(
      service.create('empresa-1', 'api-key-1', {
        chave: '01-000001-01',
        tipoPessoa: 'juridica',
        razaoSocial: 'CLIENTE TESTE',
        tabelaPrecoChave: '-',
        ativo: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ tabelaPrecoChave: null }));

    expect(tx.tabelaPreco.findFirst).not.toHaveBeenCalled();
  });
});
