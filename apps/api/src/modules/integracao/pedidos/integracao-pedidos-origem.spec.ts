/* eslint-disable @typescript-eslint/no-unsafe-assignment -- matchers do jest devolvem any */
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { IntegracaoPedidoCreate } from '@plataforma/contracts';
import { IntegracaoPedidosService } from './integracao-pedidos.service';

/**
 * Pedido que nasceu de orçamento da plataforma: o ERP grava o id do orçamento
 * no pedido (C5_XIDPLA). A atualização acha o orçamento por ele e nunca cria um
 * registro novo de histórico.
 */
describe('IntegracaoPedidosService — pedido da plataforma', () => {
  const orcamentoId = '0d1e2f3a-4b5c-4d6e-8f80-91a2b3c4d5e6';

  const pedido: IntegracaoPedidoCreate = {
    chave: '01-004512',
    codigoErp: '004512',
    situacao: 'liberado',
    itens: [
      {
        chave: '01-004512-01-P001',
        produtoChave: '01-P001',
        quantidade: 5,
        vlrUnitario: 10,
        quantidadeEntregue: 0,
      },
    ],
    notas: [],
    orcamentoId,
    origemPlataforma: true,
  };

  function montar(
    orcamento: Record<string, unknown> | null,
    porChave: Record<string, unknown> | null = null,
  ) {
    const tx = {
      orcamento: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(where.chave != null ? porChave : orcamento),
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              id: orcamentoId,
              situacaoErp: data.situacaoErp,
              comQuebra: data.comQuebra ?? false,
            }),
          ),
        create: jest.fn(),
      },
      orcamentoItem: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      withTenant: jest.fn((_e: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const service = new IntegracaoPedidosService(prisma as never);
    return { service, tx };
  }

  const aprovado = {
    id: orcamentoId,
    origem: 'vendedor',
    status: 'aprovado',
    chave: null,
    itens: [{ id: 'item-1', produto: { chave: '01-P001' } }],
  };

  it('sem vínculo da chave, o id do pedido liga e atualiza o orçamento', async () => {
    const { service, tx } = montar(aprovado);
    await service.atualizar('e1', 'k1', pedido);
    expect(tx.orcamento.create).not.toHaveBeenCalled();
    // vínculo: chave, número do pedido e chave do item casada pelo produto
    expect(tx.orcamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chave: '01-004512',
          codigoErp: '004512',
        }),
      }),
    );
    expect(tx.orcamentoItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { chave: '01-004512-01-P001' },
    });
    // e a atualização de status do mesmo pedido
    expect(tx.orcamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ situacaoErp: 'liberado' }),
      }),
    );
  });

  it('pedido da plataforma sem id e sem chave vinculada não vira histórico', async () => {
    const { service, tx } = montar(null);
    await expect(
      service.atualizar('e1', 'k1', { ...pedido, orcamentoId: undefined }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.orcamento.create).not.toHaveBeenCalled();
  });

  it('id que não existe na plataforma é recusado, sem criar nada', async () => {
    const { service, tx } = montar(null);
    await expect(service.atualizar('e1', 'k1', pedido)).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.orcamento.create).not.toHaveBeenCalled();
  });

  it('orçamento já ligado a outro pedido é recusado', async () => {
    const { service } = montar({ ...aprovado, chave: '01-000999' });
    await expect(service.atualizar('e1', 'k1', pedido)).rejects.toThrow(
      ConflictException,
    );
  });

  it('orçamento que não está aprovado não recebe pedido', async () => {
    const { service } = montar({ ...aprovado, status: 'enviado' });
    await expect(service.atualizar('e1', 'k1', pedido)).rejects.toThrow(
      ConflictException,
    );
  });

  it('chave já vinculada segue o caminho normal, sem usar o id', async () => {
    const { service, tx } = montar(aprovado, {
      id: orcamentoId,
      origem: 'vendedor',
      deletedAt: null,
    });
    await service.atualizar('e1', 'k1', pedido);
    expect(tx.orcamentoItem.update).not.toHaveBeenCalled();
    expect(tx.orcamento.update).toHaveBeenCalledTimes(1);
  });
});
