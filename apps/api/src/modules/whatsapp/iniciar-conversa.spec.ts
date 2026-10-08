import { BadRequestException } from '@nestjs/common';
import { WhatsappConversasService } from './whatsapp-conversas.service';

/**
 * Vincular um contato escolhido (jid) a um cliente — a opção "Vincular
 * WhatsApp" do atendimento da Posição de Cliente.
 *
 * O número que vale é o do contato escolhido. O do cadastro só entra quando
 * não veio contato nenhum: antes ele sobrescrevia o telefone do contato e
 * recusava o vínculo de cliente sem telefone cadastrado.
 */
describe('WhatsappConversasService.iniciarConversa — contato escolhido', () => {
  const JID = '5567999990000@s.whatsapp.net';
  const CLIENTE = '11111111-1111-1111-1111-111111111111';
  const user = { id: 'u1', isAdmin: true, empresaAtivaId: 'e1' } as never;

  type Upsert = {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  };

  const montar = (cliente: Record<string, string | null>) => {
    const tx = {
      vendedor: { findFirst: jest.fn().mockResolvedValue({ id: 'v1' }) },
      whatsappSessao: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          status: 'conectada',
          usuarioId: 'u1',
        }),
      },
      cliente: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ razaoSocial: 'Açougue X', ...cliente }),
      },
      whatsappContato: {
        upsert: jest.fn<Promise<unknown>, [Upsert]>().mockResolvedValue({
          id: 'ct1',
          clienteId: CLIENTE,
          fotoUrl: 'ja-tem-foto',
          jid: JID,
          telefoneNormalizado: null,
        }),
      },
      whatsappConversa: { upsert: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    const prisma = {
      withTenant: (_empresa: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const service = new WhatsappConversasService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, tx };
  };

  it('vincula cliente sem telefone no cadastro', async () => {
    const { service, tx } = montar({
      celular: null,
      telefone: null,
      telefone2: null,
    });

    await service.iniciarConversa('e1', user, { jid: JID, clienteId: CLIENTE });

    const args = tx.whatsappContato.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      jid: JID,
      clienteId: CLIENTE,
      telefoneNormalizado: null,
    });
  });

  it('não troca o telefone do contato pelo do cadastro', async () => {
    const { service, tx } = montar({
      celular: '67988887777',
      telefone: null,
      telefone2: null,
    });

    await service.iniciarConversa('e1', user, { jid: JID, clienteId: CLIENTE });

    const args = tx.whatsappContato.upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty('telefoneNormalizado');
    expect(args.create.telefoneNormalizado).toBeNull();
  });

  it('sem contato escolhido, cliente sem telefone continua recusado', async () => {
    const { service, tx } = montar({
      celular: null,
      telefone: null,
      telefone2: null,
    });

    await expect(
      service.iniciarConversa('e1', user, { clienteId: CLIENTE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsappContato.upsert).not.toHaveBeenCalled();
  });
});
