import { ajustarValidadeOrcamento } from './validade-orcamento';

describe('Validade de orçamento em dia útil', () => {
  function banco() {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { data: new Date('2026-10-12T00:00:00Z') },
        { data: new Date('2027-01-01T00:00:00Z') },
      ]);
    return { tx: { feriado: { findMany } } as never, findMany };
  }
  it('prorroga o sábado, seguido de feriado na segunda, para terça-feira', async () => {
    const { tx, findMany } = banco();
    const original = new Date('2026-10-10T00:00:00Z');
    expect(await ajustarValidadeOrcamento(tx, 'empresa-1', original)).toEqual(
      new Date('2026-10-13T00:00:00Z'),
    );
    expect(original.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1' },
      select: { data: true },
    });
  });
  it('preserva a data civil sem deslocar para a véspera no fuso local', async () => {
    const { tx } = banco();
    const dia = new Date('2026-10-09T00:00:00Z');
    expect(await ajustarValidadeOrcamento(tx, 'e', dia)).toEqual(dia);
  });
  it('considera feriados na mudança de ano', async () => {
    expect(
      await ajustarValidadeOrcamento(
        banco().tx,
        'e',
        new Date('2027-01-01T00:00:00Z'),
      ),
    ).toEqual(new Date('2027-01-04T00:00:00Z'));
  });
  it('preserva validade removida ou não enviada sem consultar feriados', async () => {
    const { tx, findMany } = banco();
    expect(await ajustarValidadeOrcamento(tx, 'e', null)).toBeNull();
    expect(await ajustarValidadeOrcamento(tx, 'e', undefined)).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
