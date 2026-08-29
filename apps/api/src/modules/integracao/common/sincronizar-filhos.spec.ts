import { sincronizarFilhos } from './sincronizar-filhos';

describe('sincronizarFilhos', () => {
  it('exclui somente o filho marcado com delete e sincroniza os ativos', () => {
    const resultado = sincronizarFilhos('empresa-1', [
      { empresaId: 'empresa-1', codigoErp: 'ITEM-1', delete: false, valor: 10 },
      { empresaId: 'empresa-1', codigoErp: 'ITEM-2', delete: true, valor: 20 },
    ]);

    expect(resultado.deleteMany).toEqual({ codigoErp: { in: ['ITEM-2'] } });
    expect(resultado.upsert).toHaveLength(1);
    expect(resultado.upsert[0].create).toEqual({
      empresaId: 'empresa-1',
      codigoErp: 'ITEM-1',
      valor: 10,
    });
    expect(resultado.upsert[0].update).not.toHaveProperty('delete');
  });
});
