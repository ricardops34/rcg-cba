import { resolverVendedor } from './resolver-vendedor';

describe('resolverVendedor', () => {
  it('deve retornar null para vendedorChave nulo ou vazio', async () => {
    const tx = {} as any;
    expect(await resolverVendedor(tx, 'emp-1', null)).toBeNull();
    expect(await resolverVendedor(tx, 'emp-1', undefined)).toBeNull();
    expect(await resolverVendedor(tx, 'emp-1', '')).toBeNull();
  });

  it('deve encontrar vendedor por chave exata ou por codigoErp', async () => {
    const mockFindFirst = jest.fn().mockResolvedValue({ id: 'vend-123' });
    const tx = {
      vendedor: {
        findFirst: mockFindFirst,
      },
    } as any;

    const result = await resolverVendedor(tx, 'emp-1', '  -00312');

    expect(result).toBe('vend-123');
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        empresaId: 'emp-1',
        deletedAt: null,
        OR: [
          { chave: '  -00312' },
          { chave: '-00312' },
          { codigoErp: '  -00312' },
          { codigoErp: '-00312' },
          { codigoErp: '00312' },
          { chave: { endsWith: '-00312' } },
          { chave: '00312' },
        ],
      },
      select: { id: true },
    });
  });

  it('deve lançar NotFoundException quando vendedor não for encontrado', async () => {
    const tx = {
      vendedor: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;

    await expect(resolverVendedor(tx, 'emp-1', '-99999')).rejects.toThrow(
      "vendedorChave '-99999' não encontrado",
    );
  });
});
