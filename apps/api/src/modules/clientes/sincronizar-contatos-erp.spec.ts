/* eslint-disable @typescript-eslint/no-unsafe-assignment -- matchers do jest devolvem any */
import { sincronizarContatosErp } from './sincronizar-contatos-erp';

type Linha = Record<string, unknown>;

function montar(opcoes: {
  porPosicao?: Record<number, Linha>;
  porEmail?: Linha;
}) {
  const tx = {
    clienteContato: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Linha }) => {
        if (where.posicaoErp != null) {
          return Promise.resolve(
            opcoes.porPosicao?.[where.posicaoErp as number] ?? null,
          );
        }
        return Promise.resolve(opcoes.porEmail ?? null);
      }),
      create: jest.fn().mockResolvedValue({ id: 'novo' }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  return tx;
}

const cliente = (extra: Linha) => ({ id: 'c1', ...extra });
const vazio = {
  credencial: null,
  _count: { whatsappNumeros: 0, orcamentosDecididos: 0 },
};

describe('sincronizarContatosErp', () => {
  it('cria o contato da posição; número WhatsApp vai para o celular', async () => {
    const tx = montar({});
    await sincronizarContatosErp(
      tx as never,
      'e1',
      cliente({
        contato1Tipo: 'comprador',
        contato1Nome: ' Maria ',
        contato1Telefone: '67999112233',
        contato1Whatsapp: true,
        contato1Email: 'MARIA@X.COM',
      }),
      'integracao',
    );
    expect(tx.clienteContato.create).toHaveBeenCalledTimes(1);
    expect(tx.clienteContato.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nome: 'Maria',
        email: 'maria@x.com',
        celular: '67999112233',
        telefone: null,
        tipo: 'comprador',
        origem: 'erp',
        posicaoErp: 1,
        clienteId: 'c1',
        empresaId: 'e1',
      }),
    });
  });

  it('contato só com telefone entra sem e-mail', async () => {
    const tx = montar({});
    await sincronizarContatosErp(
      tx as never,
      'e1',
      cliente({ contato2Nome: 'Financeiro', contato2Telefone: '6733214455' }),
      null,
    );
    expect(tx.clienteContato.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: null,
        telefone: '6733214455',
        celular: null,
      }),
    });
  });

  it('posição esvaziada pelo ERP: apaga o que ninguém usa', async () => {
    const tx = montar({ porPosicao: { 3: { id: 'x3', ...vazio } } });
    await sincronizarContatosErp(tx as never, 'e1', cliente({}), null);
    expect(tx.clienteContato.delete).toHaveBeenCalledWith({
      where: { id: 'x3' },
    });
  });

  it('posição esvaziada mas com portal ou WhatsApp vinculado: só inativa', async () => {
    const tx = montar({
      porPosicao: {
        1: { id: 'p', ...vazio, credencial: { id: 'cred' } },
        2: {
          id: 'w',
          ...vazio,
          _count: { whatsappNumeros: 1, orcamentosDecididos: 0 },
        },
      },
    });
    await sincronizarContatosErp(tx as never, 'e1', cliente({}), null);
    expect(tx.clienteContato.delete).not.toHaveBeenCalled();
    expect(tx.clienteContato.update).toHaveBeenCalledTimes(2);
    expect(tx.clienteContato.update).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: { ativo: false, updatedBy: null },
    });
  });

  it('e-mail igual ao de um contato digitado na plataforma: adota o registro', async () => {
    const tx = montar({
      porEmail: { id: 'manual', origem: 'plataforma', posicaoErp: null },
    });
    await sincronizarContatosErp(
      tx as never,
      'e1',
      cliente({ contato1Nome: 'Ana', contato1Email: 'ana@x.com' }),
      null,
    );
    expect(tx.clienteContato.create).not.toHaveBeenCalled();
    expect(tx.clienteContato.update).toHaveBeenCalledWith({
      where: { id: 'manual' },
      data: expect.objectContaining({ origem: 'erp', posicaoErp: 1 }),
    });
  });

  it('e-mail já usado por outra posição do ERP: este fica sem e-mail', async () => {
    const tx = montar({
      porEmail: { id: 'outro', origem: 'erp', posicaoErp: 1 },
    });
    await sincronizarContatosErp(
      tx as never,
      'e1',
      cliente({ contato2Nome: 'Bia', contato2Email: 'ana@x.com' }),
      null,
    );
    expect(tx.clienteContato.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: null, posicaoErp: 2 }),
    });
  });
});
