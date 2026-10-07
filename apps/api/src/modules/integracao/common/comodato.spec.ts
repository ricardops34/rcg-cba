import type { TenantTx } from '../../../common/prisma/prisma.service';
import {
  CFOPS_REMESSA_COMODATO,
  CFOPS_RETORNO_COMODATO,
  itemEhComodato,
  recalcularComodatoDaNota,
} from './comodato';

describe('itemEhComodato', () => {
  it('marca pelo CFOP de remessa e de retorno, tolerando espaços', () => {
    expect(itemEhComodato('5908', CFOPS_REMESSA_COMODATO)).toBe(true);
    expect(itemEhComodato('6908 ', CFOPS_REMESSA_COMODATO)).toBe(true);
    expect(itemEhComodato('1909', CFOPS_RETORNO_COMODATO)).toBe(true);
    expect(itemEhComodato('2909', CFOPS_RETORNO_COMODATO)).toBe(true);
  });

  it('não marca venda, nem o comodato recebido de fornecedor', () => {
    expect(itemEhComodato('5102', CFOPS_REMESSA_COMODATO)).toBe(false);
    expect(itemEhComodato('5909', CFOPS_REMESSA_COMODATO)).toBe(false);
    expect(itemEhComodato('1908', CFOPS_RETORNO_COMODATO)).toBe(false);
    expect(itemEhComodato(null, CFOPS_REMESSA_COMODATO)).toBe(false);
  });

  it('respeita o que o ERP informou', () => {
    expect(itemEhComodato('5102', CFOPS_REMESSA_COMODATO, true)).toBe(true);
  });
});

describe('recalcularComodatoDaNota', () => {
  function txCom(
    atual: boolean,
    itens: boolean[],
  ): { tx: TenantTx; update: jest.Mock } {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      notaSaida: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ comodato: atual }),
        update,
      },
      notaSaidaItem: {
        findMany: jest
          .fn()
          .mockResolvedValue(itens.map((comodato) => ({ comodato }))),
      },
    } as unknown as TenantTx;
    return { tx, update };
  }

  it('marca a nota em que todos os itens são comodato', async () => {
    const { tx, update } = txCom(false, [true, true]);
    expect(await recalcularComodatoDaNota(tx, 'saida', 'n1')).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { comodato: true },
    });
  });

  it('não marca a nota mista: a venda continua sendo venda', async () => {
    const { tx, update } = txCom(false, [true, false]);
    expect(await recalcularComodatoDaNota(tx, 'saida', 'n1')).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('desmarca quando a nota deixa de ser só comodato', async () => {
    const { tx, update } = txCom(true, [true, false]);
    expect(await recalcularComodatoDaNota(tx, 'saida', 'n1')).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { comodato: false },
    });
  });

  it('nota sem item fica com o que foi informado', async () => {
    const { tx } = txCom(false, []);
    expect(await recalcularComodatoDaNota(tx, 'saida', 'n1')).toBe(false);
    const informado = txCom(false, []);
    expect(
      await recalcularComodatoDaNota(informado.tx, 'saida', 'n1', true),
    ).toBe(true);
  });
});
