import { instanteLocal } from '../../../common/horario/expediente';
import { WhatsappRoteiroExecucaoService } from './whatsapp-roteiro-execucao.service';

// Sem esperar de verdade os segundos de "digitando…".
jest.mock('./roteiro-saudacao', () => ({
  ...jest.requireActual<typeof import('./roteiro-saudacao')>(
    './roteiro-saudacao',
  ),
  atrasoDeDigitacaoMs: () => 0,
}));
// O registro diário no histórico tem teste próprio.
jest.mock('../../../common/atividades/registrar-atendimento-whatsapp', () => ({
  registrarAtendimentoWhatsapp: jest.fn().mockResolvedValue(true),
}));

/**
 * A execução do roteiro: chamar para confirmar, iniciar na hora e avisar atraso
 * (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7). Terça 2030-03-12.
 */
const DIA = '2030-03-12';
const H = (hhmm: string) => instanteLocal(DIA, hhmm);

interface Opcoes {
  sessaoStatus?: string;
  sessaoUsuario?: string;
  reservar?: number;
  restringir?: boolean;
}

type Chamadas = [{ data: Record<string, unknown> }][];

const montar = (o: Opcoes = {}) => {
  const itemBase = {
    id: 'i1',
    clienteId: 'c1',
    conversaId: 'conv1',
    roteiro: {
      usuarioId: 'u1',
      vendedorId: 'v1',
      textoNota: 'Reativação: título vencido',
    },
  };
  const cadeia: Record<
    string,
    { superiorId: string | null; usuarioId: string | null; nome: string }
  > = {
    v1: { superiorId: 'v2', usuarioId: 'u1', nome: 'Maria' },
    v2: { superiorId: 'v3', usuarioId: 'u-sup', nome: 'Sup' },
    v3: { superiorId: null, usuarioId: 'u-ger', nome: 'Ger' },
  };
  const tx = {
    whatsappRoteiroItem: {
      updateMany: jest.fn().mockResolvedValue({ count: o.reservar ?? 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue(itemBase),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockResolvedValue({ roteiro: { usuarioId: 'u1' }, clienteId: 'c1' }),
    },
    whatsappConversa: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'conv1',
        contato: { jid: '5565999990000@s.whatsapp.net' },
        sessao: {
          id: 's1',
          status: o.sessaoStatus ?? 'conectada',
          usuarioId: o.sessaoUsuario ?? 'u1',
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    usuario: {
      findFirst: jest.fn().mockResolvedValue({
        nome: 'Maria Silva',
        nomeWhatsapp: null,
        usarNomeWhatsapp: true,
      }),
      findUnique: jest.fn().mockResolvedValue({
        restringirHorario: o.restringir ?? false,
        horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({
          diaSemana,
          horaInicio: '08:00',
          horaFim: '18:00',
        })),
      }),
    },
    cliente: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ razaoSocial: 'Açougue X', nomeFantasia: null }),
    },
    whatsappMensagem: {
      create: jest.fn().mockResolvedValue({ id: 'm1', criadaEm: new Date() }),
    },
    whatsappAcaoRegistro: { create: jest.fn().mockResolvedValue({}) },
    vendedor: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(cadeia[where.id]),
        ),
    },
    notificacao: { findMany: jest.fn().mockResolvedValue([]) },
    feriado: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    empresa: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const provedores = {
    presenca: jest.fn().mockResolvedValue(undefined),
    enviarTexto: jest.fn().mockResolvedValue({ externoId: 'ext1' }),
  };
  const roteiros = {
    usuariosDaSupervisao: jest.fn().mockResolvedValue(['u-sup', 'u-ger']),
  };
  const servico = new WhatsappRoteiroExecucaoService(
    prisma as never,
    provedores as never,
    roteiros as never,
  );
  return { servico, tx, provedores, roteiros };
};

const valoresDasNotificacoes = (tx: ReturnType<typeof montar>['tx']) =>
  (tx.$executeRaw.mock.calls as unknown[][]).flatMap((c) => c.slice(1));

describe('WhatsappRoteiroExecucaoService.iniciarItem', () => {
  it('mostra digitando, manda a saudação assinada, grava a nota e avisa o vendedor', async () => {
    const { servico, tx, provedores } = montar();

    await servico.iniciarItem('e1', 'i1');

    expect(provedores.presenca).toHaveBeenCalledWith(
      'e1',
      's1',
      expect.objectContaining({ estado: 'digitando' }),
    );
    const envio = (provedores.enviarTexto.mock.calls as unknown[][])[0];
    expect(envio[1]).toBe('s1');
    const texto = (envio[2] as { texto: string }).texto;
    // Assinada, como as demais mensagens da plataforma, e é uma saudação.
    expect(texto).toContain('*Maria Silva:*');
    expect(texto).toMatch(
      /(Bom dia|Boa tarde|Boa noite|bom dia|boa tarde|boa noite).*\?/,
    );

    // A nota vem do texto da geração, só na plataforma.
    expect(
      (tx.whatsappAcaoRegistro.create.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      acao: 'anotacao',
      detalhe: { texto: 'Reativação: título vencido', roteiro: true },
    });
    expect(
      (tx.whatsappMensagem.create.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      direcao: 'saida',
      enviadaPor: 'u1',
    });
    expect(valoresDasNotificacoes(tx)).toEqual(
      expect.arrayContaining([
        'roteiro_iniciado',
        '/comercial/atendimento?conversa=conv1',
      ]),
    );
  });

  it('só age quem conseguir reservar o item (outra réplica já pegou)', async () => {
    const { servico, provedores } = montar({ reservar: 0 });
    await servico.iniciarItem('e1', 'i1');
    expect(provedores.enviarTexto).not.toHaveBeenCalled();
  });

  it('WhatsApp desconectado: nada é enviado e o item fica com erro visível', async () => {
    const { servico, tx, provedores } = montar({
      sessaoStatus: 'desconectada',
    });

    await servico.iniciarItem('e1', 'i1');

    expect(provedores.enviarTexto).not.toHaveBeenCalled();
    const ultimaAtualizacao = (
      tx.whatsappRoteiroItem.update.mock.calls as Chamadas
    ).at(-1)![0].data;
    expect(ultimaAtualizacao).toMatchObject({ status: 'erro' });
    expect(String(ultimaAtualizacao.erro)).toContain('não estava conectado');
    expect(valoresDasNotificacoes(tx)).toContain('whatsapp_agendamento_erro');
  });

  it('instância de outro usuário: não fala pelo aparelho alheio', async () => {
    const { servico, provedores } = montar({ sessaoUsuario: 'u-outro' });
    await servico.iniciarItem('e1', 'i1');
    expect(provedores.enviarTexto).not.toHaveBeenCalled();
  });
});

describe('WhatsappRoteiroExecucaoService.iniciarVencidos', () => {
  const comItemVencido = (restringir: boolean) => {
    const m = montar({ restringir });
    m.tx.whatsappRoteiroItem.findMany.mockResolvedValue([
      { id: 'i1', roteiro: { usuarioId: 'u1' } },
    ]);
    return m;
  };

  it('dentro do expediente, inicia', async () => {
    const { servico, provedores } = comItemVencido(true);
    await servico.iniciarVencidos('e1', H('09:00'));
    expect(provedores.enviarTexto).toHaveBeenCalled();
  });

  it('fora do expediente (rotina voltou à noite), espera: não envia nada', async () => {
    const { servico, provedores } = comItemVencido(true);
    await servico.iniciarVencidos('e1', H('22:00'));
    expect(provedores.enviarTexto).not.toHaveBeenCalled();
  });

  it('só considera atendimento confirmado e já na hora', async () => {
    const { servico, tx } = comItemVencido(false);
    await servico.iniciarVencidos('e1', H('09:00'));
    const where = (
      tx.whatsappRoteiroItem.findMany.mock.calls as [
        { where: Record<string, unknown> },
      ][]
    )[0][0].where;
    expect(where).toMatchObject({
      status: 'confirmado',
      quando: { lte: H('09:00') },
    });
  });
});

describe('WhatsappRoteiroExecucaoService.chamarParaConfirmar', () => {
  const itens = [
    { quando: H('08:00'), roteiro: { usuarioId: 'u1' } },
    { quando: H('08:30'), roteiro: { usuarioId: 'u1' } },
    { quando: H('09:00'), roteiro: { usuarioId: 'u2' } },
  ];

  it('um aviso por vendedor e por dia, com a contagem e o link do dia', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findMany.mockResolvedValue(itens);

    await servico.chamarParaConfirmar('e1', H('07:45'));

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const valores = valoresDasNotificacoes(tx);
    expect(valores).toEqual(
      expect.arrayContaining([
        'u1',
        'u2',
        'roteiro_confirmar',
        `/crm/agenda?roteiro=confirmar&dia=${DIA}`,
      ]),
    );
    expect(
      valores.some(
        (v) => typeof v === 'string' && v.startsWith('2 atendimentos'),
      ),
    ).toBe(true);
  });

  it('não chama de novo quem já foi avisado naquele dia', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findMany.mockResolvedValue(itens);
    tx.notificacao.findMany.mockResolvedValue([{ referenciaId: `u1:${DIA}` }]);

    await servico.chamarParaConfirmar('e1', H('07:45'));

    // Só o u2.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(valoresDasNotificacoes(tx)).toContain('u2');
  });
});

describe('WhatsappRoteiroExecucaoService.avisarAtrasos', () => {
  it('avisa supervisor e gerente uma vez e marca o item', async () => {
    const { servico, tx } = montar();
    tx.whatsappRoteiroItem.findMany.mockResolvedValue([
      {
        id: 'i1',
        clienteId: 'c1',
        quando: H('09:00'),
        roteiro: { vendedorId: 'v1' },
      },
    ]);

    await servico.avisarAtrasos('e1', H('10:00'));

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(valoresDasNotificacoes(tx)).toEqual(
      expect.arrayContaining(['u-sup', 'u-ger', 'roteiro_atraso']),
    );
    expect(
      (tx.whatsappRoteiroItem.update.mock.calls as Chamadas)[0][0].data,
    ).toMatchObject({
      avisoAtrasoEm: H('10:00'),
    });
  });

  it('procura só o que passou da tolerância e ainda não foi avisado', async () => {
    const { servico, tx } = montar();
    await servico.avisarAtrasos('e1', H('10:00'));
    const where = (
      tx.whatsappRoteiroItem.findMany.mock.calls as [
        { where: Record<string, unknown> },
      ][]
    )[0][0].where;
    expect(where).toMatchObject({
      status: { in: ['agendado', 'confirmado'] },
      avisoAtrasoEm: null,
    });
  });
});
