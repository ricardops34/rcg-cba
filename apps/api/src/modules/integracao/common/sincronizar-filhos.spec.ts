import {
  consolidarFilhos,
  criarFilhos,
  sincronizarFilhos,
} from './sincronizar-filhos';

describe('sincronizarFilhos', () => {
  const pai = { campo: 'notaSaidaId' as const, id: 'nota-1' };

  it('exclui somente o filho marcado com delete e sincroniza os ativos', () => {
    const resultado = sincronizarFilhos(pai, [
      { empresaId: 'empresa-1', chave: '01-NF1-01', delete: false, valor: 10 },
      { empresaId: 'empresa-1', chave: '01-NF1-02', delete: true, valor: 20 },
    ]);

    expect(resultado.deleteMany).toEqual({ chave: { in: ['01-NF1-02'] } });
    expect(resultado.upsert).toHaveLength(1);
    expect(resultado.upsert[0].create).toEqual({
      empresaId: 'empresa-1',
      chave: '01-NF1-01',
      valor: 10,
    });
    expect(resultado.upsert[0].update).not.toHaveProperty('delete');
  });

  it('casa o filho pela chave dentro do cabeçalho', () => {
    const resultado = sincronizarFilhos(pai, [
      { chave: '01-NF1-01', delete: false },
    ]);

    expect(resultado.upsert[0].where).toEqual({
      notaSaidaId_chave: { notaSaidaId: 'nota-1', chave: '01-NF1-01' },
    });
  });

  it('recusa filho sem chave', () => {
    expect(() =>
      sincronizarFilhos(pai, [{ chave: '', delete: false }]),
    ).toThrow(/sem chave/);
  });

  it('mantém a versão ativa quando a mesma chave também veio excluída', () => {
    const filhos = consolidarFilhos([
      { chave: 'ITEM-1', delete: true, preco: 20 },
      { chave: 'ITEM-1', delete: false, preco: 25 },
      { chave: 'ITEM-1', delete: false, preco: 25 },
    ]);

    expect(filhos).toEqual([{ chave: 'ITEM-1', delete: false, preco: 25 }]);
    expect(criarFilhos(filhos)).toEqual([{ chave: 'ITEM-1', preco: 25 }]);
  });

  it('recusa versões ativas diferentes da mesma chave', () => {
    expect(() =>
      consolidarFilhos([
        { chave: 'ITEM-1', delete: false, preco: 20 },
        { chave: 'ITEM-1', delete: false, preco: 25 },
      ]),
    ).toThrow(/dados ativos diferentes/);
  });
});
