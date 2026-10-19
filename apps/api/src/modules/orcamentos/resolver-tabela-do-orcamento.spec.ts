import { BadRequestException, ConflictException } from '@nestjs/common';
import { resolverTabelaDoOrcamento } from './resolver-tabela-do-orcamento';
import { resolverTabelaPrecoCliente } from '../../common/precos/resolver-tabela-preco-cliente';

jest.mock('../../common/precos/resolver-tabela-preco-cliente', () => ({
  resolverTabelaPrecoCliente: jest.fn(),
}));

const PADRAO = 'tabela-do-cliente';
const OUTRA = 'outra-tabela';

function tx(ativa: boolean) {
  return {
    tabelaPreco: {
      findFirst: jest.fn().mockResolvedValue(ativa ? { id: OUTRA } : null),
    },
  } as never;
}

describe('resolverTabelaDoOrcamento', () => {
  beforeEach(() => {
    (resolverTabelaPrecoCliente as jest.Mock).mockResolvedValue(PADRAO);
  });

  it('sem escolha, usa a do cliente', async () => {
    await expect(
      resolverTabelaDoOrcamento(tx(true), 'e', 'c', undefined, false),
    ).resolves.toBe(PADRAO);
  });

  it('com a troca desligada, outra tabela é recusada', async () => {
    await expect(
      resolverTabelaDoOrcamento(tx(true), 'e', 'c', OUTRA, false),
    ).rejects.toThrow(ConflictException);
  });

  it('com a troca ligada, aceita outra tabela ativa', async () => {
    await expect(
      resolverTabelaDoOrcamento(tx(true), 'e', 'c', OUTRA, true),
    ).resolves.toBe(OUTRA);
  });

  it('com a troca ligada, tabela inativa ou de outra empresa é recusada', async () => {
    await expect(
      resolverTabelaDoOrcamento(tx(false), 'e', 'c', OUTRA, true),
    ).rejects.toThrow(BadRequestException);
  });

  it('reenviar a tabela já gravada não conta como troca', async () => {
    await expect(
      resolverTabelaDoOrcamento(tx(true), 'e', 'c', OUTRA, false, OUTRA),
    ).resolves.toBe(OUTRA);
  });

  it('reenviar a do cliente é sempre permitido', async () => {
    await expect(
      resolverTabelaDoOrcamento(tx(true), 'e', 'c', PADRAO, false),
    ).resolves.toBe(PADRAO);
  });
});
