import { PrismaService } from '../../../common/prisma/prisma.service';
import { ParametrosService } from '../../parametros/parametros.service';
import { IntegracaoProdutosService } from './integracao-produtos.service';

describe('IntegracaoProdutosService', () => {
  const empresaId = 'empresa-1';
  const apiKeyId = 'chave-1';

  function montar(armazemPadrao: string | null) {
    const tx = {
      produto: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 'produto-1',
          categoria: null,
          subCategoria: null,
          armazem: data.armazemId
            ? { chave: data.armazemId === 'armazem-1' ? '01-01' : '02-01' }
            : null,
          regraDesconto: null,
          fabricante: null,
          createdAt: new Date('2026-09-23T12:00:00.000Z'),
          updatedAt: new Date('2026-09-23T12:00:00.000Z'),
          createdBy: data.createdBy,
        })),
      },
      armazem: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.chave === '01') return Promise.resolve(null);
          return Promise.resolve({
            id: where.chave === '01-01' ? 'armazem-1' : 'armazem-2',
          });
        }),
        findMany: jest.fn().mockResolvedValue([{ id: 'armazem-1' }]),
      },
      fornecedor: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (tenant: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const parametros = {
      obterTexto: jest.fn().mockResolvedValue(armazemPadrao),
    };
    const service = new IntegracaoProdutosService(
      prisma as unknown as PrismaService,
      parametros as unknown as ParametrosService,
    );
    return { service, tx, parametros };
  }

  const produtoBase = {
    chave: '01-P001',
    codigoErp: 'P001',
    descricao: 'Produto de teste',
    ativo: true,
  };

  it('usa ARMAZEM_PADRAO quando armazemChave não vem no produto', async () => {
    const { service, tx, parametros } = montar('01-01');

    await service.create(empresaId, apiKeyId, produtoBase);

    expect(parametros.obterTexto).toHaveBeenCalledWith(
      empresaId,
      'ARMAZEM_PADRAO',
      null,
      tx,
    );
    expect(tx.armazem.findFirst).toHaveBeenCalledWith({
      where: { empresaId, chave: '01-01', deletedAt: null },
      select: { id: true },
    });
    expect(tx.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ armazemId: 'armazem-1' }),
      }),
    );
  });

  it('trata a chave "-" do Protheus como armazém vazio', async () => {
    const { service, tx, parametros } = montar('01-01');

    await service.create(empresaId, apiKeyId, {
      ...produtoBase,
      armazemChave: '-',
    });

    expect(parametros.obterTexto).toHaveBeenCalledWith(
      empresaId,
      'ARMAZEM_PADRAO',
      null,
      tx,
    );
    expect(tx.armazem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ chave: '01-01' }),
      }),
    );
  });

  it('aceita codigoErp no parâmetro ARMAZEM_PADRAO quando ele é único', async () => {
    const { service, tx } = montar('01');

    await service.create(empresaId, apiKeyId, produtoBase);

    expect(tx.armazem.findMany).toHaveBeenCalledWith({
      where: { empresaId, codigoErp: '01', deletedAt: null },
      select: { id: true },
      take: 2,
    });
    expect(tx.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ armazemId: 'armazem-1' }),
      }),
    );
  });

  it('recusa codigoErp ambíguo no ARMAZEM_PADRAO', async () => {
    const { service, tx } = montar('01');
    tx.armazem.findMany.mockResolvedValue([
      { id: 'armazem-1' },
      { id: 'armazem-2' },
    ]);

    await expect(
      service.create(empresaId, apiKeyId, produtoBase),
    ).rejects.toThrow("ARMAZEM_PADRAO '01' corresponde a mais de um armazém");
    expect(tx.produto.create).not.toHaveBeenCalled();
  });

  it('prioriza o armazém informado pelo ERP', async () => {
    const { service, tx, parametros } = montar('01-01');

    await service.create(empresaId, apiKeyId, {
      ...produtoBase,
      armazemChave: '02-01',
    });

    expect(parametros.obterTexto).not.toHaveBeenCalled();
    expect(tx.armazem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ chave: '02-01' }),
      }),
    );
    expect(tx.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ armazemId: 'armazem-2' }),
      }),
    );
  });

  it('mantém armazém nulo quando entrada e parâmetro estão vazios', async () => {
    const { service, tx } = montar(null);

    await service.create(empresaId, apiKeyId, {
      ...produtoBase,
      armazemChave: '',
    });

    expect(tx.armazem.findFirst).not.toHaveBeenCalled();
    expect(tx.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ armazemId: null }),
      }),
    );
  });

  it('aceita produto quando fabricanteChave não existe', async () => {
    const { service, tx } = montar(null);

    await expect(
      service.create(empresaId, apiKeyId, {
        ...produtoBase,
        fabricanteChave: '-000734-01',
      }),
    ).resolves.toEqual(expect.objectContaining({ fabricanteChave: null }));

    expect(tx.fornecedor.findFirst).toHaveBeenCalledWith({
      where: {
        empresaId,
        chave: '-000734-01',
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(tx.produto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fabricanteId: null }),
      }),
    );
  });

  it('considera sucesso excluir um produto inexistente', async () => {
    const { service, tx } = montar(null);

    await expect(
      service.remove(empresaId, apiKeyId, 'INEXISTENTE'),
    ).resolves.toBeUndefined();
    expect(tx.produto.update).not.toHaveBeenCalled();
  });

  it('considera excluído no lote mesmo quando o produto não existe', async () => {
    const { service } = montar(null);

    const resultado = await service.upsertLote(empresaId, apiKeyId, [
      { chave: 'INEXISTENTE', excluido: true },
    ]);

    expect(resultado).toEqual(
      expect.objectContaining({
        processados: 1,
        excluidos: 1,
        erros: [],
      }),
    );
  });
});
