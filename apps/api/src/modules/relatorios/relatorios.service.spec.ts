import { BadRequestException } from '@nestjs/common';
import {
  ORDEM_COMPRAS,
  RelatoriosService,
  ordenar,
  periodo,
} from './relatorios.service';

describe('periodo', () => {
  it('é fechado nos dois dias', () => {
    const { de, ate } = periodo('2026-07-13', '2026-10-13');
    expect(de.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(ate.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });

  it('recusa fim antes do início', () => {
    expect(() => periodo('2026-10-13', '2026-10-01')).toThrow(
      BadRequestException,
    );
  });
});

describe('RelatoriosService.estoqueCompra', () => {
  function montar(linhas: Record<string, unknown>[]) {
    const tx = {
      parametroEmpresa: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue(linhas),
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return {
      // O estoqueCompra não lê parâmetros; o construtor pede o service desde fb22c6e.
      service: new RelatoriosService(prisma as never, {} as never),
      prisma,
    };
  }

  const base = {
    codigoCorp: null,
    fornecedor: null,
    entradas: 0,
    ultimoPreco: null,
  };

  it('média = saída ÷ meses e comprar = média × meses de compra − estoque, como a planilha', async () => {
    // Linhas da planilha da compra: 3 meses de movimento, compra para 6.
    const { service } = montar([
      {
        ...base,
        produtoId: 'a',
        codigo: '0101000009',
        descricao: 'HIGINDOOR 560 -20L',
        estoque: 14,
        saidas: 6,
      },
      {
        ...base,
        produtoId: 'b',
        codigo: '0101000010',
        descricao: 'HIGINDOOR 563 -20L',
        estoque: 11,
        saidas: 10,
      },
      {
        ...base,
        produtoId: 'c',
        codigo: '0102000009',
        descricao: 'AG-CLIN HIPOCLORITO 12%',
        estoque: 0,
        saidas: 55,
      },
    ]);

    const r = await service.estoqueCompra('e1', {
      inicio: '2026-07-13',
      fim: '2026-10-13',
      mesesPeriodo: 3,
      mesesCompra: 6,
      comMovimento: true,
    });

    expect(r.mesesPeriodo).toBe(3);
    expect(r.linhas.map((l) => [l.media, l.aComprar])).toEqual([
      [2, -2],
      [3.33, 9],
      [18.33, 110],
    ]);
  });

  it('sem atalho, a média é pelos dias do período', async () => {
    const { service } = montar([
      {
        ...base,
        produtoId: 'a',
        codigo: 'x',
        descricao: 'x',
        estoque: 0,
        saidas: 30.44,
      },
    ]);

    const r = await service.estoqueCompra('e1', {
      inicio: '2026-01-01',
      fim: '2026-01-30',
      mesesCompra: 1,
      comMovimento: false,
    });

    expect(r.mesesPeriodo).toBeCloseTo(30 / 30.44, 2);
    expect(r.linhas[0].media).toBeCloseTo(30.88, 1);
  });

  it('lê dentro do contexto da empresa', async () => {
    const { service, prisma } = montar([]);
    await service.estoqueCompra('e1', {
      inicio: '2026-01-01',
      fim: '2026-01-31',
      mesesCompra: 6,
      comMovimento: false,
    });
    expect(prisma.withTenant).toHaveBeenCalledWith(
      'e1',
      expect.any(Function),
      expect.anything(),
    );
  });
});

describe('ordenar', () => {
  const padrao = [{ id: 'asc' as const }];

  it('coluna clicada vem primeiro, a padrão desempata', () => {
    expect(
      ordenar(ORDEM_COMPRAS, { ordem: 'vlrTotal', sentido: 'desc' }, padrao),
    ).toEqual([{ vlrTotal: 'desc' }, { id: 'asc' }]);
    expect(
      ordenar(ORDEM_COMPRAS, { ordem: 'razaoSocial', sentido: 'asc' }, padrao),
    ).toEqual([{ fornecedor: { razaoSocial: 'asc' } }, { id: 'asc' }]);
  });

  it('campo fora da lista (ou herdado do Object) fica só na padrão', () => {
    for (const ordem of [undefined, 'senha', 'constructor', '__proto__']) {
      expect(ordenar(ORDEM_COMPRAS, { ordem, sentido: 'asc' }, padrao)).toEqual(
        padrao,
      );
    }
  });
});
