import { ConflictException, NotFoundException } from '@nestjs/common';
import { integracaoTabelaPrecoCreateSchema } from '@plataforma/contracts';
import type { TenantTx } from '../../../common/prisma/prisma.service';
import { resolverRegraDesconto } from './resolver-regra-desconto';

describe('resolverRegraDesconto', () => {
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const tx = {
    regraDesconto: { findFirst, findMany },
  } as unknown as TenantTx;

  beforeEach(() => jest.clearAllMocks());

  it('resolve primeiro pela chave completa', async () => {
    findFirst.mockResolvedValue({ id: 'regra-1' });

    await expect(
      resolverRegraDesconto(tx, 'empresa-1', '-000001'),
    ).resolves.toBe('regra-1');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('aceita o codigoErp legado quando ele identifica uma única regra', async () => {
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: 'regra-1', chave: '-000001' }]);

    await expect(
      resolverRegraDesconto(tx, 'empresa-1', '000001'),
    ).resolves.toBe('regra-1');
  });

  it('recusa codigoErp ambíguo entre filiais', async () => {
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([
      { id: 'regra-1', chave: '01-000001' },
      { id: 'regra-2', chave: '02-000001' },
    ]);

    await expect(
      resolverRegraDesconto(tx, 'empresa-1', '000001'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('informa quando chave e código não existem', async () => {
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([]);

    await expect(
      resolverRegraDesconto(tx, 'empresa-1', 'INEXISTENTE'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mantém regraDescontoCodigo no DTO legado da tabela de preço', () => {
    const payload = integracaoTabelaPrecoCreateSchema.parse({
      chave: '-053',
      codigoErp: '053',
      descricao: 'TABELA PADRAO INTERIOR',
      ativo: true,
      itens: [
        {
          chave: '-053-PRODUTO-0001',
          produtoChave: '-PRODUTO',
          preco: 10,
          regraDescontoCodigo: '000001',
          ativo: true,
        },
      ],
    });

    expect(payload.itens[0].regraDescontoCodigo).toBe('000001');
  });
});
