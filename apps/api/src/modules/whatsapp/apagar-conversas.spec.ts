import { apagarConversas } from './apagar-conversas';

describe('apagarConversas', () => {
  const montarTx = () => ({
    whatsappMensagem: {
      count: jest.fn().mockResolvedValue(7),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { arquivoUrl: '/uploads/whatsapp/a.jpg' },
          { arquivoUrl: '/uploads/whatsapp/b.pdf' },
        ]),
    },
    notificacao: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    lead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    whatsappConversa: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
  });

  it('apaga o sino, desliga o lead (sem apagá-lo) e só então a conversa', async () => {
    const tx = montarTx();
    const r = await apagarConversas(tx as never, ['c1', 'c2']);

    // A mídia volta para quem chamou apagar depois do commit.
    expect(r).toEqual({
      conversas: 2,
      mensagens: 7,
      arquivos: ['/uploads/whatsapp/a.jpg', '/uploads/whatsapp/b.pdf'],
    });
    expect(tx.whatsappMensagem.findMany).toHaveBeenCalledWith({
      where: { conversaId: { in: ['c1', 'c2'] }, arquivoUrl: { not: null } },
      select: { arquivoUrl: true },
    });
    expect(tx.notificacao.deleteMany).toHaveBeenCalledWith({
      where: { referenciaId: { in: ['c1', 'c2'] } },
    });
    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { conversaId: { in: ['c1', 'c2'] } },
      data: { conversaId: null },
    });
    expect(tx.whatsappConversa.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] } },
    });
  });

  it('sem conversas não toca no banco', async () => {
    const tx = montarTx();
    const r = await apagarConversas(tx as never, []);

    expect(r).toEqual({ conversas: 0, mensagens: 0, arquivos: [] });
    expect(tx.whatsappConversa.deleteMany).not.toHaveBeenCalled();
    expect(tx.notificacao.deleteMany).not.toHaveBeenCalled();
  });
});
