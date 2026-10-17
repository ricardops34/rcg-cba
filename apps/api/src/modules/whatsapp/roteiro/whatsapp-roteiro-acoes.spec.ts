import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RoteiroGravar } from '@plataforma/contracts';
import { instanteLocal } from '../../../common/horario/expediente';
import { WhatsappRoteiroService } from './whatsapp-roteiro.service';

/**
 * Gravar, cancelar e remarcar o roteiro (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7).
 * Terça-feira 2030-03-12, no futuro; horários pelo relógio do fuso da operação.
 */
const DIA = '2030-03-12';
const user = {
  id: 'u1',
  isAdmin: false,
  permissoes: [],
  empresaAtivaId: 'e1',
} as never;
const H = (hhmm: string) => instanteLocal(DIA, hhmm);

const faixas = (inicio = '08:00', fim = '18:00') =>
  [1, 2, 3, 4, 5].map((diaSemana) => ({
    diaSemana,
    horaInicio: inicio,
    horaFim: fim,
  }));

interface Opcoes {
  clientesDaCarteira?: string[];
  compromissos?: Date[];
  restringir?: boolean;
  conversas?: Record<string, string>;
  jaNoRoteiro?: string[];
}

type Chamadas = [{ data: Record<string, unknown> }][];

const montar = (o: Opcoes = {}) => {
  const clientes = (o.clientesDaCarteira ?? ['c1', 'c2']).map((id) => ({
    id,
    razaoSocial: `Razão ${id}`,
    nomeFantasia: null,
  }));
  const cadeia: Record<
    string,
    { superiorId: string | null; usuarioId: string | null; nome: string }
  > = {
    // v1 (vendedor) → v2 (supervisor) → v3 (gerente)
    v1: { superiorId: 'v2', usuarioId: 'u1', nome: 'Maria' },
    v2: { superiorId: 'v3', usuarioId: 'u-sup', nome: 'Sup' },
    v3: { superiorId: null, usuarioId: 'u-ger', nome: 'Ger' },
  };
  const tx = {
    vendedor: {
      findFirst: jest.fn().mockResolvedValue({ id: 'v1', nome: 'Maria' }),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(cadeia[where.id]),
        ),
    },
    cliente: {
      // Só devolve os pedidos que são da carteira.
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(clientes.filter((c) => where.id.in.includes(c.id))),
        ),
    },
    feriado: { findMany: jest.fn().mockResolvedValue([]) },
    usuario: {
      findUnique: jest.fn().mockResolvedValue({
        restringirHorario: o.restringir ?? true,
        horarios: faixas(),
      }),
    },
    atividade: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (o.compromissos ?? []).map((dataVencimento) => ({ dataVencimento })),
        ),
      create: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: 'ativ-novo' })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    whatsappSessao: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
    whatsappConversa: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(o.conversas ?? {}).map(([clienteId, id]) => ({
          id,
          clienteId,
        })),
      ),
    },
    whatsappRoteiro: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    whatsappRoteiroItem: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (o.jaNoRoteiro ?? []).map((clienteId) => ({ clienteId })),
        ),
      create: jest.fn().mockResolvedValue({ id: 'i1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
  };
  return {
    servico: new WhatsappRoteiroService(prisma as never, {} as never),
    tx,
  };
};

const gravarInput = (
  itens: { clienteId: string; quando: Date }[],
): RoteiroGravar => ({
  parametros: {
    dataInicio: DIA,
    dataFim: DIA,
    intervaloMin: 30,
    criterios: {
      tituloVencido: true,
      naoCompraramNoMes: false,
      mesmoPeriodoMesPassado: false,
    },
  },
  textoNota: 'Reativação de clientes com título vencido',
  itens: itens.map((i) => ({
    ...i,
    motivos: ['titulo_vencido' as const],
    detalhe: 'R$ 100 vencido',
  })),
});

describe('WhatsappRoteiroService.gravar', () => {
  it('cria roteiro, item e a atividade da agenda ligada ao item', async () => {
    const { servico, tx } = montar({ conversas: { c1: 'conv-c1' } });
    const r = await servico.gravar(
      'e1',
      user,
      gravarInput([
        { clienteId: 'c1', quando: H('08:00') },
        { clienteId: 'c2', quando: H('08:30') },
      ]),
    );

    expect(r).toEqual({ roteiroId: 'r1', quantidade: 2 });
    expect(tx.whatsappRoteiroItem.create).toHaveBeenCalledTimes(2);
    const dadosAtividade = (tx.atividade.create.mock.calls as Chamadas)[0][0]
      .data;
    expect(dadosAtividade).toMatchObject({
      vendedorId: 'v1',
      clienteId: 'c1',
      conversaId: 'conv-c1',
      // O sistema inicia a conversa: não é tarefa do vendedor nem "vence hoje".
      automatica: true,
      roteiroItemId: 'i1',
    });
    // O item aponta de volta para a atividade.
    expect(tx.whatsappRoteiroItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { atividadeId: 'ativ-novo' },
    });
  });

  it('recusa cliente que não é da carteira', async () => {
    const { servico } = montar({ clientesDaCarteira: ['c1'] });
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([
          { clienteId: 'c1', quando: H('08:00') },
          { clienteId: 'de-outro', quando: H('08:30') },
        ]),
      ),
    ).rejects.toThrow(/carteira/);
  });

  it('recusa cliente repetido', async () => {
    const { servico } = montar();
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([
          { clienteId: 'c1', quando: H('08:00') },
          { clienteId: 'c1', quando: H('08:30') },
        ]),
      ),
    ).rejects.toThrow(/repetido/);
  });

  it('recusa cliente que já está em outro roteiro no período', async () => {
    const { servico } = montar({ jaNoRoteiro: ['c1'] });
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([{ clienteId: 'c1', quando: H('08:00') }]),
      ),
    ).rejects.toThrow(/outro roteiro/);
  });

  it('recusa horário que bate com um compromisso da agenda', async () => {
    const { servico } = montar({ compromissos: [H('08:15')] });
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([{ clienteId: 'c1', quando: H('08:00') }]),
      ),
    ).rejects.toThrow(/outro compromisso/);
  });

  it('recusa dois atendimentos no mesmo horário', async () => {
    const { servico } = montar();
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([
          { clienteId: 'c1', quando: H('09:00') },
          { clienteId: 'c2', quando: H('09:10') },
        ]),
      ),
    ).rejects.toThrow(/outro compromisso/);
  });

  it('recusa horário fora do expediente do usuário', async () => {
    const { servico } = montar();
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([{ clienteId: 'c1', quando: H('20:00') }]),
      ),
    ).rejects.toThrow(/expediente/);
  });

  it('recusa horário fora do período do roteiro', async () => {
    const { servico } = montar();
    await expect(
      servico.gravar(
        'e1',
        user,
        gravarInput([
          { clienteId: 'c1', quando: instanteLocal('2030-03-13', '09:00') },
        ]),
      ),
    ).rejects.toThrow(/fora do período/);
  });
});

describe('WhatsappRoteiroService.cancelar', () => {
  const item = (id: string, status: string) => ({
    id,
    status,
    atividadeId: `ativ-${id}`,
    roteiro: { vendedorId: 'v1' },
  });

  it('cancela com motivo, tira da agenda e avisa supervisor e gerente', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findMany.mockResolvedValue([
      item('i1', 'agendado'),
      item('i2', 'confirmado'),
    ]);

    const r = await servico.cancelar('e1', user, {
      itemIds: ['i1', 'i2'],
      motivo: 'Cliente pediu para ligar na semana que vem',
    });

    expect(r).toEqual({ canceladas: 2 });
    expect(
      (tx.whatsappRoteiroItem.updateMany.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      status: 'cancelado',
      motivoCancelamento: 'Cliente pediu para ligar na semana que vem',
      canceladoPor: 'u1',
    });
    expect(
      (tx.atividade.updateMany.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      ativo: false,
    });
    // Um aviso para o supervisor e um para o gerente.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const valores = (tx.$executeRaw.mock.calls as unknown[][]).flatMap((c) =>
      c.slice(1),
    );
    expect(valores).toEqual(
      expect.arrayContaining(['u-sup', 'u-ger', 'roteiro_cancelado']),
    );
  });

  it('não cancela o que já começou', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findMany.mockResolvedValue([item('i1', 'iniciado')]);
    await expect(
      servico.cancelar('e1', user, {
        itemIds: ['i1'],
        motivo: 'Não dá mais tempo hoje',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsappRoteiroItem.updateMany).not.toHaveBeenCalled();
  });

  it('não cancela item de outro usuário (a consulta só devolve os do próprio)', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findMany.mockResolvedValue([item('i1', 'agendado')]);
    await expect(
      servico.cancelar('e1', user, {
        itemIds: ['i1', 'de-outro'],
        motivo: 'Motivo qualquer aqui',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = (
      tx.whatsappRoteiroItem.findMany.mock.calls as [
        { where: Record<string, unknown> },
      ][]
    )[0][0].where;
    expect(where).toMatchObject({ roteiro: { usuarioId: 'u1' } });
  });
});

describe('WhatsappRoteiroService.remarcar', () => {
  const itemExistente = {
    id: 'i1',
    status: 'confirmado',
    atividadeId: 'ativ-i1',
    quando: instanteLocal(DIA, '09:00'),
    ajustes: [],
    roteiro: { vendedorId: 'v1', intervaloMin: 30 },
  };

  it('remarca para horário livre, guarda o motivo e volta a aguardar confirmação', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findFirst.mockResolvedValue(itemExistente);

    await servico.remarcar('e1', user, 'i1', {
      quando: H('14:00'),
      motivo: 'Reunião marcada de última hora',
    });

    const dados = (tx.whatsappRoteiroItem.update.mock.calls as Chamadas)[0][0]
      .data;
    expect(dados).toMatchObject({ status: 'agendado', confirmadoEm: null });
    expect(dados.ajustes).toEqual([
      expect.objectContaining({
        tipo: 'remarcado',
        motivo: 'Reunião marcada de última hora',
        por: 'u1',
      }),
    ]);
    expect(
      (tx.atividade.updateMany.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      dataVencimento: H('14:00'),
    });
  });

  it('recusa horário ocupado ou fora do expediente', async () => {
    const { servico, tx } = montar({ compromissos: [H('15:00')] });
    tx.whatsappRoteiroItem.findFirst.mockResolvedValue(itemExistente);
    await expect(
      servico.remarcar('e1', user, 'i1', {
        quando: H('15:10'),
        motivo: 'Preciso mudar o horário',
      }),
    ).rejects.toThrow(/outro compromisso/);
    await expect(
      servico.remarcar('e1', user, 'i1', {
        quando: H('21:00'),
        motivo: 'Preciso mudar o horário',
      }),
    ).rejects.toThrow(/expediente/);
  });

  it('não remarca o que já começou', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findFirst.mockResolvedValue({
      ...itemExistente,
      status: 'iniciado',
    });
    await expect(
      servico.remarcar('e1', user, 'i1', {
        quando: H('14:00'),
        motivo: 'Preciso mudar o horário',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WhatsappRoteiroService.confirmar', () => {
  const montarConfirmacao = (
    itens: Record<string, unknown>[],
    iniciarConversa: jest.Mock,
  ) => {
    const tx = {
      whatsappRoteiroItem: {
        findMany: jest.fn().mockResolvedValue(itens),
        update: jest.fn().mockResolvedValue({}),
      },
      cliente: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', razaoSocial: 'Um', nomeFantasia: null },
          { id: 'c2', razaoSocial: 'Dois', nomeFantasia: null },
          { id: 'c3', razaoSocial: 'Três', nomeFantasia: null },
        ]),
      },
      atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      notificacao: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const servico = new WhatsappRoteiroService(
      prisma as never,
      { iniciarConversa } as never,
    );
    return { servico, tx };
  };

  const agora = Date.now();
  const itens = [
    // já tem conversa
    {
      id: 'i1',
      clienteId: 'c1',
      conversaId: 'conv1',
      contatoId: 'ct1',
      atividadeId: 'a1',
      quando: new Date(agora + 3_600_000),
    },
    // só tem telefone no cadastro: a conversa nasce agora
    {
      id: 'i2',
      clienteId: 'c2',
      conversaId: null,
      contatoId: null,
      atividadeId: 'a2',
      quando: new Date(agora + 7_200_000),
    },
    // o número não existe no WhatsApp
    {
      id: 'i3',
      clienteId: 'c3',
      conversaId: null,
      contatoId: null,
      atividadeId: 'a3',
      quando: new Date(agora + 10_800_000),
    },
    // passou há mais de duas horas
    {
      id: 'i4',
      clienteId: 'c1',
      conversaId: 'conv1',
      contatoId: 'ct1',
      atividadeId: 'a4',
      quando: new Date(agora - 3 * 3_600_000),
    },
  ];

  it('confirma, cria a conversa de quem só tem cadastro e separa erro e atrasado', async () => {
    const iniciarConversa = jest
      .fn()
      .mockImplementation(
        (_e: string, _u: unknown, i: { clienteId: string }) =>
          i.clienteId === 'c3'
            ? Promise.reject(
                new BadRequestException('Este número não está no WhatsApp.'),
              )
            : Promise.resolve({ id: 'conv2', contatoId: 'ct2' }),
      );
    const { servico, tx } = montarConfirmacao(itens, iniciarConversa);

    const r = await servico.confirmar('e1', user, { dia: DIA });

    expect(r.confirmados).toBe(2);
    expect(r.atrasados).toEqual(['i4']);
    expect(r.comErro).toEqual([
      {
        itemId: 'i3',
        clienteNome: 'Três',
        erro: 'Este número não está no WhatsApp.',
      },
    ]);
    // A conversa só foi criada para quem não tinha.
    expect(iniciarConversa).toHaveBeenCalledTimes(2);

    const atualizacoes = (
      tx.whatsappRoteiroItem.update.mock.calls as [
        { where: { id: string }; data: Record<string, unknown> },
      ][]
    ).map(([c]) => [c.where.id, c.data.status]);
    expect(atualizacoes).toEqual(
      expect.arrayContaining([
        ['i1', 'confirmado'],
        ['i2', 'confirmado'],
        ['i3', 'erro'],
      ]),
    );
    // O atrasado fica como está: o vendedor remarca.
    expect(atualizacoes.some(([id]) => id === 'i4')).toBe(false);
    // O chamado do dia está atendido.
    expect(tx.notificacao.updateMany).toHaveBeenCalled();
  });

  it('só olha o que é do próprio usuário e ainda está aguardando', async () => {
    const { servico, tx } = montarConfirmacao([], jest.fn());
    await servico.confirmar('e1', user, { itemIds: ['i1'] });
    const where = (
      tx.whatsappRoteiroItem.findMany.mock.calls as [
        { where: Record<string, unknown> },
      ][]
    )[0][0].where;
    expect(where).toMatchObject({
      status: 'agendado',
      roteiro: { usuarioId: 'u1' },
      id: { in: ['i1'] },
    });
  });
});

describe('WhatsappRoteiroService.finalizar', () => {
  const montarFinal = (status: string) => {
    const tx = {
      whatsappRoteiroItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          status,
          atividadeId: 'a1',
          conversaId: 'conv1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      atividade: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      whatsappAcaoRegistro: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    return {
      servico: new WhatsappRoteiroService(prisma as never, {} as never),
      tx,
    };
  };

  it('fecha o item, conclui a atividade e registra no histórico da conversa', async () => {
    const { servico, tx } = montarFinal('iniciado');

    await servico.finalizar('e1', user, 'i1', {
      resultado: 'Pediu orçamento de 20 caixas; retorno quinta.',
    });

    expect(
      (tx.whatsappRoteiroItem.update.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      status: 'finalizado',
      resultado: 'Pediu orçamento de 20 caixas; retorno quinta.',
    });
    expect(
      (tx.atividade.updateMany.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      concluida: true,
      descricao: 'Pediu orçamento de 20 caixas; retorno quinta.',
    });
    expect(
      (tx.whatsappAcaoRegistro.create.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      acao: 'atendimento_finalizado',
      conversaId: 'conv1',
      detalhe: {
        resultado: 'Pediu orçamento de 20 caixas; retorno quinta.',
        roteiro: true,
      },
    });
  });

  it('só finaliza o que foi iniciado', async () => {
    const { servico, tx } = montarFinal('confirmado');
    await expect(
      servico.finalizar('e1', user, 'i1', { resultado: 'Resultado qualquer' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsappRoteiroItem.update).not.toHaveBeenCalled();
  });
});
