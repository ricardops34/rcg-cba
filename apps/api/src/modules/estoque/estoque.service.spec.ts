import { EstoqueService } from './estoque.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('EstoqueService: ordenação por saldo', () => {
  it.each(['asc', 'desc'] as const)('ordena antes de paginar (%s)', async (sortOrder) => {
    const tx = {
      produto: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
          .mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }]),
        count: jest.fn().mockResolvedValue(3),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
      estoque: {
        groupBy: jest.fn().mockResolvedValue([
          { produtoId: 'a', _sum: { saldo: 0 }, _count: { _all: 1 }, _max: {} },
          { produtoId: 'b', _sum: { saldo: 10 }, _count: { _all: 1 }, _max: {} },
        ]),
      },
    };
    const withTenant = jest.fn((_empresaId, callback) => callback(tx));
    const service = new EstoqueService({ withTenant } as unknown as PrismaService);
    const result = await service.findAll('empresa', {
      page: 2, pageSize: 2, sortBy: 'saldoTotal', sortOrder, armazemId: 'armazem',
    });

    expect(withTenant).toHaveBeenCalledWith('empresa', expect.any(Function));
    const sql = tx.$queryRaw.mock.calls[0][0];
    expect(sql.text).toContain(`ORDER BY COALESCE(s.saldo, 0) ${sortOrder.toUpperCase()}, p.id ASC`);
    expect(sql.text).toContain('a.revenda = true');
    expect(sql.values).toContain('armazem');
    expect(sql.values.slice(-2)).toEqual([2, 2]);
    const consultaPagina = tx.produto.findMany.mock.calls[1][0];
    expect(consultaPagina.where.id).toEqual({ in: ['a', 'b'] });
    expect(consultaPagina.skip).toBeUndefined();
    expect(result.data.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.total).toBe(3);
  });
});
