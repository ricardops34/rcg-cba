import {
  normalizarNome,
  ReceitaReferenciasService,
} from './receita-referencias.service';

describe('normalizarNome', () => {
  it('ignora acento, caixa, apóstrofo e hífen', () => {
    expect(normalizarNome('Boa Esperança do Norte')).toBe(
      'BOA ESPERANCA DO NORTE',
    );
    expect(normalizarNome("Santa Bárbara d'Oeste")).toBe(
      'SANTA BARBARA DOESTE',
    );
    expect(normalizarNome('Não-Me-Toque')).toBe('NAO ME TOQUE');
  });
});

describe('ReceitaReferenciasService.atualizarReferencias', () => {
  const municipios = [
    {
      id: 'cg',
      descricao: 'Campo Grande',
      codigoIbge: '5002704',
      codigoReceita: null,
      estado: { sigla: 'MS' },
    },
    {
      id: 'ben',
      descricao: 'Boa Esperança do Norte',
      codigoIbge: '5101837',
      codigoReceita: null,
      estado: { sigla: 'MT' },
    },
    // Nome repetido em duas UFs, nenhum no Tesouro: não dá para escolher.
    {
      id: 'x1',
      descricao: 'Vila Nova',
      codigoIbge: '1111111',
      codigoReceita: null,
      estado: { sigla: 'PR' },
    },
    {
      id: 'x2',
      descricao: 'Vila Nova',
      codigoIbge: '2222222',
      codigoReceita: null,
      estado: { sigla: 'SC' },
    },
  ];

  function montar() {
    const updates: { id: string; codigoReceita: string }[] = [];
    const prisma = {
      municipio: {
        findMany: jest.fn().mockResolvedValue(municipios),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: { codigoReceita: string };
          }) => {
            updates.push({ id: where.id, codigoReceita: data.codigoReceita });
            return Promise.resolve();
          },
        ),
      },
      naturezaJuridica: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ codigo: '2062', descricao: 'Antiga' }]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      cnae: {
        findMany: jest.fn().mockResolvedValue([{ codigoErp: '4712100' }]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const base = {
      chamarControle: jest.fn().mockResolvedValue({
        status: 200,
        corpo: {
          mes: '2026-11',
          tesouro: [
            {
              codigoReceita: '9051',
              nome: 'CAMPO GRANDE',
              uf: 'MS',
              ibge: '5002704',
            },
          ],
          municipios: [
            { codigo: '9051', descricao: 'CAMPO GRANDE' },
            { codigo: '1182', descricao: 'BOA ESPERANCA DO NORTE' },
            { codigo: '7777', descricao: 'VILA NOVA' },
          ],
          naturezas: [
            { codigo: '2062', descricao: 'Sociedade Empresária Limitada' },
            { codigo: '2135', descricao: 'Empresário (Individual)' },
          ],
          cnaes: [
            { codigo: '4712100', descricao: 'Minimercados' },
            { codigo: '1234567', descricao: 'Código só da Receita' },
          ],
        },
      }),
    };
    const service = new ReceitaReferenciasService(
      prisma as never,
      base as never,
    );
    return { service, prisma, updates };
  }

  it('casa pelo Tesouro, completa o município novo pelo nome e não chuta nome ambíguo', async () => {
    const { service, updates } = montar();
    const r = await service.atualizarReferencias('empresa');
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'cg', codigoReceita: '9051' },
        { id: 'ben', codigoReceita: '1182' },
      ]),
    );
    expect(updates).toHaveLength(2);
    expect(r.municipiosPeloTesouro).toBe(1);
    expect(r.municipiosPeloNome).toEqual([
      { nome: 'Boa Esperança do Norte', uf: 'MT', codigoReceita: '1182' },
    ]);
    expect(r.municipiosSemCodigo.map((m) => m.uf).sort()).toEqual(['PR', 'SC']);
  });

  it('cria natureza nova, corrige a descrição e inclui só o CNAE que falta', async () => {
    const { service, prisma } = montar();
    const r = await service.atualizarReferencias('empresa');
    expect(prisma.naturezaJuridica.createMany).toHaveBeenCalledWith({
      data: [{ codigo: '2135', descricao: 'Empresário (Individual)' }],
      skipDuplicates: true,
    });
    expect(r.naturezasAtualizadas).toBe(1);
    expect(r.cnaesNovos).toEqual([
      { codigo: '1234567', descricao: 'Código só da Receita' },
    ]);
  });
});
