import { BadRequestException } from '@nestjs/common';
import type { RoteiroParametros } from '@plataforma/contracts';
import { diaLocal } from '../../../common/horario/expediente';
import { WhatsappRoteiroService } from './whatsapp-roteiro.service';

/**
 * Prévia do roteiro semanal: o que o serviço junta do banco antes de as regras
 * puras (roteiro-semanal.spec.ts) decidirem.
 */
describe('WhatsappRoteiroService.previa', () => {
  const hoje = diaLocal(new Date());
  // Uma terça-feira no futuro: dia útil e sempre depois de "hoje".
  const TERCA = '2030-03-12';
  const user = (permissoes: string[]) =>
    ({ id: 'u1', isAdmin: false, permissoes, empresaAtivaId: 'e1' }) as never;
  const TODAS = ['notas-saida.visualizar', 'titulos-receber.visualizar'];

  const parametros = (
    parcial: Partial<RoteiroParametros> = {},
  ): RoteiroParametros => ({
    dataInicio: TERCA,
    dataFim: TERCA,
    intervaloMin: 30,
    criterios: {
      tituloVencido: true,
      naoCompraramNoMes: false,
      mesmoPeriodoMesPassado: false,
    },
    horaInicio: '00:00',
    horaFim: '23:30',
    ...parcial,
  });

  const cliente = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    razaoSocial: `Razão ${id}`,
    nomeFantasia: null,
    telefone: null,
    telefone2: null,
    celular: null,
    ...extra,
  });

  const montar = (opcoes: {
    clientes: ReturnType<typeof cliente>[];
    titulos?: { clienteId: string }[];
    conversas?: string[];
    contatos?: string[];
    jaNoRoteiro?: string[];
    vendedor?: boolean;
  }) => {
    const tx = {
      vendedor: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opcoes.vendedor === false ? null : { id: 'v1' }),
      },
      cliente: { findMany: jest.fn().mockResolvedValue(opcoes.clientes) },
      notaSaida: { groupBy: jest.fn().mockResolvedValue([]) },
      tituloReceber: {
        groupBy: jest.fn().mockResolvedValue(
          (opcoes.titulos ?? []).map((t) => ({
            clienteId: t.clienteId,
            _min: { vencimento: new Date('2030-01-01T00:00:00Z') },
            _sum: { saldo: 100 },
          })),
        ),
      },
      whatsappRoteiroItem: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opcoes.jaNoRoteiro ?? []).map((clienteId) => ({ clienteId })),
          ),
      },
      whatsappSessao: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
      whatsappConversa: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opcoes.conversas ?? []).map((clienteId) => ({ clienteId })),
          ),
      },
      whatsappContato: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opcoes.contatos ?? []).map((clienteId) => ({ clienteId })),
          ),
      },
      usuario: { findUnique: jest.fn().mockResolvedValue(null) },
      feriado: { findMany: jest.fn().mockResolvedValue([]) },
      atividade: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    return { servico: new WhatsappRoteiroService(prisma as never), tx };
  };

  it('recusa quem não tem cadastro de vendedor', async () => {
    const { servico } = montar({ clientes: [], vendedor: false });
    await expect(
      servico.previa('e1', user(TODAS), parametros()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('respeita a permissão de cada critério', async () => {
    const { servico } = montar({ clientes: [cliente('a')] });
    // Título vencido sem ver títulos a receber.
    await expect(
      servico.previa('e1', user(['notas-saida.visualizar']), parametros()),
    ).rejects.toThrow(/títulos/);
    // Critério de compra sem ver notas de saída.
    await expect(
      servico.previa(
        'e1',
        user(['titulos-receber.visualizar']),
        parametros({
          criterios: {
            semCompraDias: 30,
            tituloVencido: false,
            naoCompraramNoMes: false,
            mesmoPeriodoMesPassado: false,
          },
        }),
      ),
    ).rejects.toThrow(/vendas/);
  });

  it('recusa período que já terminou', async () => {
    const { servico } = montar({ clientes: [cliente('a')] });
    await expect(
      servico.previa(
        'e1',
        user(TODAS),
        parametros({ dataInicio: '2020-01-06', dataFim: '2020-01-07' }),
      ),
    ).rejects.toThrow(/período já terminou/);
    expect(hoje >= '2020-01-07').toBe(true);
  });

  it('só propõe quem dá para atender: conversa, contato ou telefone no cadastro', async () => {
    const { servico } = montar({
      clientes: [
        cliente('conversa'),
        cliente('contato'),
        cliente('cadastro', { celular: '(65) 99999-1111' }),
        cliente('nada'),
      ],
      titulos: [
        { clienteId: 'conversa' },
        { clienteId: 'contato' },
        { clienteId: 'cadastro' },
        { clienteId: 'nada' },
      ],
      conversas: ['conversa'],
      contatos: ['contato'],
    });

    const r = await servico.previa('e1', user(TODAS), parametros());

    const origemPorCliente = Object.fromEntries(
      r.itens.map((i) => [i.clienteId, i.origem]),
    );
    expect(origemPorCliente).toEqual({
      conversa: 'conversa',
      contato: 'contato',
      cadastro: 'cadastro',
    });
    expect(r.semWhatsapp.map((c) => c.clienteId)).toEqual(['nada']);
    expect(r.resumo.candidatos).toBe(4);
  });

  it('cliente que já está num roteiro em andamento no período não entra de novo', async () => {
    const { servico } = montar({
      clientes: [
        cliente('a', { celular: '65999991111' }),
        cliente('b', { celular: '65999992222' }),
      ],
      titulos: [{ clienteId: 'a' }, { clienteId: 'b' }],
      jaNoRoteiro: ['a'],
    });
    const r = await servico.previa('e1', user(TODAS), parametros());
    expect(r.itens.map((i) => i.clienteId)).toEqual(['b']);
  });

  it('quem não cabe nos horários livres vai para "sem horário"', async () => {
    const { servico } = montar({
      clientes: [
        cliente('a', { celular: '65999991111' }),
        cliente('b', { celular: '65999992222' }),
        cliente('c', { celular: '65999993333' }),
      ],
      titulos: [{ clienteId: 'a' }, { clienteId: 'b' }, { clienteId: 'c' }],
    });
    const r = await servico.previa(
      'e1',
      user(TODAS),
      // Uma hora de expediente, 30 min por atendimento: só 2 horários.
      parametros({ horaInicio: '10:00', horaFim: '11:00' }),
    );
    expect(r.resumo.horariosLivres).toBe(2);
    expect(r.itens).toHaveLength(2);
    expect(r.semHorario).toHaveLength(1);
    expect(r.resumo.expediente).toBe('informado');
  });
});
