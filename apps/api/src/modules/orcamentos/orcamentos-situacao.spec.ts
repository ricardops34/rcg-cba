import { OrcamentosService } from './orcamentos.service';

/**
 * Filtro de situação da listagem de orçamentos: aberto, vencido e faturado.
 * O ponto delicado é o `situacaoErp` nulo — `NOT IN` o descartaria no SQL.
 */
describe('OrcamentosService — filtro de situação', () => {
  type Filtro = (s?: 'aberto' | 'vencido' | 'faturado') => unknown;
  const filtro: Filtro = (situacao) => {
    const servico = Object.create(OrcamentosService.prototype) as {
      filtroSituacao: Filtro;
    };
    return servico.filtroSituacao(situacao);
  };

  it('sem situação, não filtra', () => {
    expect(filtro(undefined)).toBeNull();
  });

  it('faturado é o pedido faturado, total ou parcial', () => {
    expect(filtro('faturado')).toEqual({
      situacaoErp: { in: ['faturado', 'faturado_parcial'] },
    });
  });

  it('vencido inclui o expirado e o aberto com a validade passada', () => {
    const f = filtro('vencido') as { OR: Record<string, unknown>[] };
    expect(f.OR[0]).toEqual({ status: 'expirado' });
    expect(f.OR[1]).toMatchObject({
      status: { in: ['rascunho', 'enviado'] },
      dataValidade: { lt: expect.any(Date) as Date },
    });
  });

  it('aberto aceita validade em branco e situação do ERP nula', () => {
    const f = filtro('aberto') as { AND: Record<string, unknown>[] };
    expect(f.AND[0]).toEqual({ status: { in: ['rascunho', 'enviado'] } });
    // validade em branco OU não vencida
    expect(f.AND[1]).toMatchObject({
      OR: [
        { dataValidade: null },
        { dataValidade: { gte: expect.any(Date) as Date } },
      ],
    });
    // "não faturado" escrito como nulo OU fora da lista
    expect(f.AND[2]).toEqual({
      OR: [
        { situacaoErp: null },
        { situacaoErp: { notIn: ['faturado', 'faturado_parcial'] } },
      ],
    });
  });
});
