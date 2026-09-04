import {
  motivoBloqueio,
  podeAcessar,
  whereEmpresaAcessivel,
  type EmpresaAcesso,
} from './situacao-empresa';

const AGORA = new Date('2026-09-03T12:00:00Z');
const ONTEM = new Date('2026-09-02T12:00:00Z');
const AMANHA = new Date('2026-09-04T12:00:00Z');

const empresa = (p: Partial<EmpresaAcesso>): EmpresaAcesso => ({
  situacao: 'ativa',
  testeExpiraEm: null,
  ...p,
});

describe('podeAcessar', () => {
  it('empresa ativa entra', () => {
    expect(podeAcessar(empresa({ situacao: 'ativa' }), AGORA)).toBe(true);
  });

  it('empresa ativa entra mesmo com data de teste no passado', () => {
    // A data só governa quem está em teste; deixá-la governar a ativa faria
    // um cliente pagante perder o acesso por causa do teste que ele teve.
    expect(
      podeAcessar(empresa({ situacao: 'ativa', testeExpiraEm: ONTEM }), AGORA),
    ).toBe(true);
  });

  it('teste dentro do prazo entra', () => {
    expect(
      podeAcessar(empresa({ situacao: 'teste', testeExpiraEm: AMANHA }), AGORA),
    ).toBe(true);
  });

  it('teste vencido nao entra', () => {
    expect(
      podeAcessar(empresa({ situacao: 'teste', testeExpiraEm: ONTEM }), AGORA),
    ).toBe(false);
  });

  it('teste sem prazo entra', () => {
    expect(
      podeAcessar(empresa({ situacao: 'teste', testeExpiraEm: null }), AGORA),
    ).toBe(true);
  });

  it('suspensa e cancelada nao entram', () => {
    expect(podeAcessar(empresa({ situacao: 'suspensa' }), AGORA)).toBe(false);
    expect(podeAcessar(empresa({ situacao: 'cancelada' }), AGORA)).toBe(false);
  });

  it('a expiracao e no instante, nao no dia', () => {
    const expira = new Date('2026-09-03T12:00:00Z');
    // Exatamente no instante ja esta vencido: `>` e nao `>=`.
    expect(
      podeAcessar(empresa({ situacao: 'teste', testeExpiraEm: expira }), AGORA),
    ).toBe(false);
  });
});

describe('motivoBloqueio', () => {
  it('nao da motivo para quem pode entrar', () => {
    expect(motivoBloqueio(empresa({ situacao: 'ativa' }), AGORA)).toBeNull();
  });

  it('distingue teste vencido de suspensao', () => {
    const teste = motivoBloqueio(
      empresa({ situacao: 'teste', testeExpiraEm: ONTEM }),
      AGORA,
    );
    const suspensa = motivoBloqueio(empresa({ situacao: 'suspensa' }), AGORA);
    const cancelada = motivoBloqueio(empresa({ situacao: 'cancelada' }), AGORA);

    expect(teste).toMatch(/avaliação/i);
    expect(suspensa).toMatch(/suspenso/i);
    expect(cancelada).toMatch(/encerrado/i);
    expect(new Set([teste, suspensa, cancelada]).size).toBe(3);
  });

  it('nao revela detalhe comercial na tela de login', () => {
    for (const situacao of ['teste', 'suspensa', 'cancelada'] as const) {
      const msg = motivoBloqueio(
        empresa({ situacao, testeExpiraEm: ONTEM }),
        AGORA,
      );
      expect(msg).not.toMatch(/pagamento|inadimpl|fatura|valor|R\$/i);
    }
  });

  it('a mensagem concorda com a decisao, sempre', () => {
    const casos: EmpresaAcesso[] = [
      { situacao: 'ativa', testeExpiraEm: null },
      { situacao: 'teste', testeExpiraEm: AMANHA },
      { situacao: 'teste', testeExpiraEm: ONTEM },
      { situacao: 'suspensa', testeExpiraEm: null },
      { situacao: 'cancelada', testeExpiraEm: null },
    ];
    for (const caso of casos) {
      expect(motivoBloqueio(caso, AGORA) === null).toBe(podeAcessar(caso, AGORA));
    }
  });
});

describe('whereEmpresaAcessivel', () => {
  it('aceita ativa e teste no prazo, recusa o resto', () => {
    const where = whereEmpresaAcessivel(AGORA);
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ situacao: 'ativa' });
    expect(where.OR[1]).toMatchObject({ situacao: 'teste' });
  });
});
