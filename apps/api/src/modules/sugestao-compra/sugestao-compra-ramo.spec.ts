import { SugestaoCompraService } from './sugestao-compra.service';

/**
 * Degraus do ramo (decisão de 2026-11-11): subclasse → classe → grupo,
 * parando no primeiro nível com pelo menos 5 clientes que compraram.
 */
describe('SugestaoCompraService.clientesDoMesmoRamo (degraus)', () => {
  const service = new SugestaoCompraService({} as never, {} as never);
  const ramo = (
    vinculos: { codigo: string; principal?: boolean }[],
    candidatos: { clienteId: string; codigo: string; comprou: boolean }[],
  ) => {
    const tx = {
      clienteCnae: {
        findMany: jest.fn().mockResolvedValue(
          vinculos.map((v, i) => ({
            cnaeId: `cnae-${i}`,
            principal: v.principal ?? true,
            cnae: { codigoErp: v.codigo, descricao: 'Restaurantes' },
          })),
        ),
      },
      $queryRaw: jest.fn().mockResolvedValue(candidatos),
    };
    return (
      service as unknown as {
        clientesDoMesmoRamo: (
          tx: unknown,
          empresaId: string,
          clienteId: string,
          desde: Date,
        ) => Promise<{ pares: string[]; rotulo: string } | null>;
      }
    ).clientesDoMesmoRamo(tx, 'emp', 'alvo', new Date());
  };
  const varios = (
    n: number,
    codigo: string,
    comprou = true,
    prefixo = codigo,
  ) =>
    Array.from({ length: n }, (_, i) => ({
      clienteId: `${prefixo}-${i}`,
      codigo,
      comprou,
    }));

  it('fica na subclasse quando ela tem 5 clientes que compraram', async () => {
    const r = await ramo(
      [{ codigo: '5611201' }],
      [...varios(5, '5611201'), ...varios(10, '5611203')],
    );
    expect(r?.pares).toHaveLength(5);
    expect(r?.rotulo).toBe('do mesmo ramo (5611-2/01 Restaurantes)');
  });

  it('sobe para a classe quando a subclasse tem poucos', async () => {
    const r = await ramo(
      [{ codigo: '5611201' }],
      [
        ...varios(1, '5611201'),
        ...varios(6, '5611203'),
        ...varios(9, '5620101'),
      ],
    );
    expect(r?.pares).toHaveLength(7);
    expect(r?.rotulo).toBe('da mesma classe de atividade (CNAE 5611-2)');
  });

  it('sobe para o grupo, e não passa dele', async () => {
    const r = await ramo(
      [{ codigo: '5611201' }],
      [
        ...varios(2, '5611201'),
        ...varios(4, '5612100'),
        ...varios(20, '5620101'),
      ],
    );
    // Grupo 561 = 5611201 + 5612100; 5620101 é outro grupo (562).
    expect(r?.pares).toHaveLength(6);
    expect(r?.rotulo).toBe('do mesmo grupo de atividade (CNAE 56.1)');
  });

  it('nenhum nível chega a 5: o mais amplo com comprador', async () => {
    const r = await ramo(
      [{ codigo: '5611201' }],
      [
        ...varios(1, '5611201'),
        ...varios(2, '5612100', false),
        ...varios(1, '5612100', true, 'x'),
      ],
    );
    expect(r?.rotulo).toBe('do mesmo grupo de atividade (CNAE 56.1)');
    expect(r?.pares).toHaveLength(4);
  });

  it('ninguém comprou: o primeiro nível que tem algum cliente', async () => {
    const r = await ramo(
      [{ codigo: '5611201' }],
      [...varios(3, '5611203', false)],
    );
    expect(r?.rotulo).toBe('da mesma classe de atividade (CNAE 5611-2)');
    expect(r?.pares).toHaveLength(3);
  });

  it('sem principal marcado, usa todos os CNAEs do cliente', async () => {
    const r = await ramo(
      [
        { codigo: '4711302', principal: false },
        { codigo: '5611201', principal: false },
      ],
      [...varios(3, '4711302'), ...varios(3, '5611201')],
    );
    expect(r?.pares).toHaveLength(6);
  });

  it('sem CNAE, null', async () => {
    expect(await ramo([], [])).toBeNull();
  });
});
