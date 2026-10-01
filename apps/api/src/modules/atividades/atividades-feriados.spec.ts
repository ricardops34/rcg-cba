import { AtividadesService } from './atividades.service';
import { criarAtividadeRetorno } from '../orcamentos/criar-atividade-retorno';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('Agendamento com feriados', () => {
  const user = { id: 'u', isAdmin: true } as AuthenticatedUser;
  function montar() {
    const create = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    );
    const tx = {
      feriado: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ data: new Date('2026-10-12T00:00:00Z') }]),
      },
      atividade: { create },
    };
    const service = new AtividadesService({
      withTenant: (_empresa: string, fn: (t: typeof tx) => unknown) => fn(tx),
    } as never);
    return { service, tx, create };
  }
  const input = {
    vendedorId: 'v',
    titulo: 'Retornar',
    tipo: 'ligacao' as const,
    dataVencimento: new Date('2026-10-10T14:00:00Z'),
    ativo: true,
    concluida: false,
  };
  it('o caminho usado pelo agente ajusta a data antes de persistir', async () => {
    const m = montar();
    await m.service.create('e', user, input);
    expect(m.create.mock.calls[0][0].data.dataVencimento).toEqual(
      new Date('2026-10-13T14:00:00Z'),
    );
  });
  it('confirmação manual mantém a data sem persistir o parâmetro de controle', async () => {
    const m = montar();
    await m.service.create('e', user, { ...input, manterDiaNaoUtil: true });
    expect(m.create.mock.calls[0][0].data.dataVencimento).toEqual(
      input.dataVencimento,
    );
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty(
      'manterDiaNaoUtil',
    );
  });
  it('preserva datas históricas de atividades concluídas', async () => {
    const m = montar();
    await m.service.create('e', user, { ...input, concluida: true });
    expect(m.create.mock.calls[0][0].data.dataVencimento).toEqual(
      input.dataVencimento,
    );
  });
  it('retorno de orçamento passa por feriado e fim de semana', async () => {
    const m = montar();
    await criarAtividadeRetorno(m.tx as never, 'e', 'u', {
      orcamentoId: 'o',
      titulo: 'Orçamento',
      clienteId: 'c',
      vendedorId: 'v',
      oportunidadeId: null,
      dataRetorno: input.dataVencimento,
    });
    expect(m.create.mock.calls[0][0].data.dataVencimento).toEqual(
      new Date('2026-10-13T14:00:00Z'),
    );
  });
});
