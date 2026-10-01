import { NotFoundException } from '@nestjs/common';
import type { IntegracaoPedidoCreate } from '@plataforma/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IntegracaoPedidosService } from './integracao-pedidos.service';

// Histórico de pedidos do ERP (docs/planos/2026-09-30-historico-pedidos-erp.md).
describe('IntegracaoPedidosService — pedido digitado no ERP', () => {
  const empresaId = 'empresa-1';
  const apiKeyId = 'chave-1';

  function montar(existente: { id: string; origem: string } | null) {
    const tx = {
      orcamento: {
        findFirst: jest.fn().mockResolvedValue(existente),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'orcamento-novo',
          situacaoErp: data.situacaoErp,
          comQuebra: data.comQuebra,
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: existente?.id,
          situacaoErp: data.situacaoErp,
          comQuebra: data.comQuebra ?? true,
        })),
      },
      orcamentoItem: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      produto: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.chave === '01-P001' ? { id: 'produto-1' } : null,
            ),
          ),
      },
      cliente: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cliente-1' }),
      },
      vendedor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'vendedor-1' }),
      },
      condicaoPagamento: {
        findFirst: jest.fn().mockResolvedValue({ id: 'condicao-1' }),
      },
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (tenant: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const service = new IntegracaoPedidosService(
      prisma as unknown as PrismaService,
    );
    return { service, tx };
  }

  const pedido: IntegracaoPedidoCreate = {
    chave: '01-004512',
    codigoErp: '004512',
    situacao: 'faturado',
    itens: [
      {
        chave: '01-004512-01-P001',
        produtoChave: '01-P001',
        quantidade: 3,
        vlrUnitario: 10.5,
        quantidadeEntregue: 3,
      },
    ],
    notas: [{ numero: '000081234', serie: '1', emissao: '2026-09-29' }],
    clienteChave: '01-000123-01',
    vendedorChave: '01-00312',
    condicaoPagamentoChave: '001',
    emissao: '2026-09-28',
  };

  it('cria o orçamento de origem erp, sem número, com os preços do ERP', async () => {
    const { service, tx } = montar(null);
    await service.atualizar(empresaId, apiKeyId, pedido);

    const { data } = tx.orcamento.create.mock.calls[0][0];
    expect(data).toMatchObject({
      chave: '01-004512',
      codigoErp: '004512',
      numero: null,
      origem: 'erp',
      status: 'aprovado',
      clienteId: 'cliente-1',
      vendedorId: 'vendedor-1',
      condicaoPagamentoId: 'condicao-1',
      titulo: 'Pedido 004512',
      vlrTotal: 31.5,
      situacaoErp: 'faturado',
      comQuebra: false,
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(data.itens.createMany.data).toEqual([
      expect.objectContaining({
        produtoId: 'produto-1',
        chave: '01-004512-01-P001',
        quantidade: 3,
        vlrUnitario: 10.5,
        vlrTotal: 31.5,
      }),
    ]);
    expect(data.dataValidade).toBeUndefined();
  });

  it('pedido de histórico já gravado é regravado como espelho', async () => {
    const { service, tx } = montar({ id: 'orcamento-erp', origem: 'erp' });
    await service.atualizar(empresaId, apiKeyId, {
      ...pedido,
      situacao: 'cancelado',
    });

    expect(tx.orcamento.create).not.toHaveBeenCalled();
    expect(tx.orcamentoItem.deleteMany).toHaveBeenCalledWith({
      where: { orcamentoId: 'orcamento-erp' },
    });
    expect(tx.orcamentoItem.createMany.mock.calls[0][0].data[0]).toMatchObject({
      orcamentoId: 'orcamento-erp',
      produtoId: 'produto-1',
    });
    expect(tx.orcamento.update.mock.calls[0][0].data).toMatchObject({
      situacaoErp: 'cancelado',
      comQuebra: false,
    });
  });

  it('pedido da plataforma continua só atualizando situação e quebra', async () => {
    const { service, tx } = montar({ id: 'orcamento-1', origem: 'vendedor' });
    await service.atualizar(empresaId, apiKeyId, pedido);

    expect(tx.orcamento.create).not.toHaveBeenCalled();
    expect(tx.orcamentoItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.orcamento.update.mock.calls[0][0].data).not.toHaveProperty(
      'clienteId',
    );
  });

  it('sem orçamento e sem cliente/vendedor/emissão continua 404', async () => {
    const { service, tx } = montar(null);
    await expect(
      service.atualizar(empresaId, apiKeyId, {
        ...pedido,
        clienteChave: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.orcamento.create).not.toHaveBeenCalled();
  });

  it('produto que não existe na plataforma é 404', async () => {
    const { service } = montar(null);
    await expect(
      service.atualizar(empresaId, apiKeyId, {
        ...pedido,
        itens: [{ ...pedido.itens[0], produtoChave: '01-NAOEXISTE' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
