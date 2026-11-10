import { historicoDescontoOrcamento } from './registrar-atividade-orcamento';

describe('historicoDescontoOrcamento', () => {
  it('devolve cada rodada com quem fez, quando e a justificativa', async () => {
    const em = (h: number) => new Date(Date.UTC(2026, 10, 10, h));
    const tx = {
      atividade: {
        findMany: jest.fn().mockResolvedValue([
          {
            titulo: 'Autorização de desconto solicitada — orçamento nº 42',
            descricao:
              'Desconto acima do máximo da regra no orçamento "X" — aguardando autorização. Justificativa do vendedor: cliente novo',
            createdAt: em(10),
            createdBy: 'u-vend',
          },
          {
            titulo: 'Desconto recusado — orçamento nº 42',
            descricao:
              'Desconto recusado no orçamento "X". Motivo: margem baixa',
            createdAt: em(11),
            createdBy: 'u-sup',
          },
          {
            titulo: 'Desconto autorizado — orçamento nº 42',
            descricao:
              'Desconto acima do máximo liberado para o orçamento "X". Justificativa: volume',
            createdAt: em(12),
            createdBy: null,
          },
        ]),
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-vend', nome: 'Vendedor' },
          { id: 'u-sup', nome: 'Supervisor' },
        ]),
      },
    };

    const historico = await historicoDescontoOrcamento(
      tx as never,
      'emp',
      'orc',
    );

    expect(historico).toEqual([
      {
        evento: 'solicitada',
        em: em(10),
        por: 'Vendedor',
        justificativa: 'cliente novo',
      },
      {
        evento: 'recusada',
        em: em(11),
        por: 'Supervisor',
        justificativa: 'margem baixa',
      },
      { evento: 'autorizada', em: em(12), por: null, justificativa: 'volume' },
    ]);
  });
});
