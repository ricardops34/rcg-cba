import { TitulosReceberService } from './titulos-receber.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('Consulta financeira com feriados', () => {
  afterEach(() => jest.useRealTimers());
  it('mantém vencimento ERP, expõe data útil e filtra antes da paginação', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T14:00:00Z'));
    const original = new Date('2026-10-10T00:00:00Z');
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 't', vencimento: original, dtBaixa: null }]);
    const tx = {
      feriado: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ data: new Date('2026-10-12T00:00:00Z') }]),
      },
      tituloReceber: { findMany, count: jest.fn().mockResolvedValue(1) },
      contaBancaria: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TitulosReceberService(
      {
        withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
      } as never,
      {} as never,
      { obterNumero: jest.fn().mockResolvedValue(60) } as never,
    );
    const resultado = await service.findAll(
      'e',
      { id: 'u', isAdmin: true } as AuthenticatedUser,
      {
        page: 1,
        pageSize: 20,
        sortOrder: 'asc',
        status: 'aberto',
      },
    );
    expect(resultado.data[0].vencimento).toEqual(original);
    expect(resultado.data[0].vencimentoEfetivo).toEqual(
      new Date('2026-10-13T00:00:00Z'),
    );
    expect(resultado.data[0].status).toBe('aberto');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { dtBaixa: null },
            {
              OR: [
                { vencimento: null },
                { vencimento: { gte: new Date('2026-10-10T00:00:00Z') } },
              ],
            },
          ],
        }) as unknown,
        take: 20,
        skip: 0,
      }),
    );
  });
});
