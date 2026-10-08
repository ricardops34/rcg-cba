import { WhatsappConversasService } from './whatsapp-conversas.service';

/**
 * Anotação interna: fica na conversa e no histórico, e não vai ao cliente.
 * "Não vai" é código, não promessa de tela: o serviço não toca o provedor.
 */
describe('WhatsappConversasService.anotar', () => {
  const user = { id: 'u1', nome: 'Ana', empresaAtivaId: 'e1' } as never;

  const montar = () => {
    const tx = {
      whatsappAcaoRegistro: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            acao: 'anotacao',
            orcamentoId: null,
            atividadeId: null,
            tituloReceberId: null,
            detalhe: { texto: 'Retornar dia 15' },
            executadaPor: 'u1',
            criadaEm: new Date('2026-10-08T12:00:00Z'),
          },
        ]),
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', nome: 'Ana' }]),
      },
    };
    const prisma = {
      withTenant: (_empresa: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const provedores = new Proxy(
      {},
      {
        get: () => {
          throw new Error('anotação não pode chamar o provedor');
        },
      },
    );
    const service = new WhatsappConversasService(
      prisma as never,
      {} as never,
      {} as never,
      provedores as never,
      {} as never,
      {} as never,
    );
    const escopo = jest
      .spyOn(
        service as unknown as { conversaNoEscopo: () => Promise<unknown> },
        'conversaNoEscopo',
      )
      .mockResolvedValue({ id: 'c1' });
    return { service, tx, escopo };
  };

  it('grava como evento interno da conversa, sem passar pelo provedor', async () => {
    const { service, tx, escopo } = montar();

    const eventos = await service.anotar('e1', user, 'c1', 'Retornar dia 15');

    expect(escopo).toHaveBeenCalled();
    expect(tx.whatsappAcaoRegistro.create).toHaveBeenCalledWith({
      data: {
        empresaId: 'e1',
        conversaId: 'c1',
        acao: 'anotacao',
        detalhe: { texto: 'Retornar dia 15' },
        executadaPor: 'u1',
      },
    });
    expect(eventos).toEqual([
      expect.objectContaining({
        acao: 'anotacao',
        detalhe: { texto: 'Retornar dia 15' },
        executadaPorNome: 'Ana',
      }),
    ]);
  });

  it('fora do escopo da conversa, não grava', async () => {
    const { service, tx, escopo } = montar();
    escopo.mockRejectedValue(new Error('Conversa não encontrada'));

    await expect(service.anotar('e1', user, 'c9', 'x')).rejects.toThrow(
      'Conversa não encontrada',
    );
    expect(tx.whatsappAcaoRegistro.create).not.toHaveBeenCalled();
  });
});
