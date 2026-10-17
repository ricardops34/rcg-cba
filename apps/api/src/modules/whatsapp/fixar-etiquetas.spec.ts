import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LIMITE_CONVERSAS_FIXADAS,
  WhatsappConversasService,
} from './whatsapp-conversas.service';
import { WhatsappEtiquetasService } from './whatsapp-etiquetas.service';

/**
 * Fixar conversa no topo (até 4) e etiquetas pessoais de contato
 * (docs/planos/2026-10-16-whatsapp-organizacao-conversas.md).
 */
const user = { id: 'u1', empresaAtivaId: 'e1' } as never;

describe('WhatsappConversasService.marcarFixada', () => {
  const montar = (conversa: Record<string, unknown>, fixadas: number) => {
    const tx = {
      whatsappConversa: {
        count: jest.fn().mockResolvedValue(fixadas),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const servico = Object.create(
      WhatsappConversasService.prototype,
    ) as WhatsappConversasService & Record<string, unknown>;
    servico['prisma'] = {
      withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    // Só quem pode falar na conversa (dono da conexão) fixa.
    servico['conversaParaEnvio'] = jest
      .fn()
      .mockResolvedValue({ id: 'c1', sessaoId: 's1', ...conversa });
    return { servico, tx };
  };

  it('fixa quando ainda há vaga', async () => {
    const { servico, tx } = montar({ fixadaEm: null }, 3);
    const r = await servico.marcarFixada('e1', user, 'c1', true);
    expect(r.fixadaEm).toBeInstanceOf(Date);
    expect(tx.whatsappConversa.update).toHaveBeenCalled();
  });

  it('recusa a quinta conversa fixada', async () => {
    const { servico, tx } = montar(
      { fixadaEm: null },
      LIMITE_CONVERSAS_FIXADAS,
    );
    await expect(
      servico.marcarFixada('e1', user, 'c1', true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsappConversa.update).not.toHaveBeenCalled();
  });

  it('fixar de novo uma já fixada não conta contra o limite e mantém a ordem', async () => {
    const antes = new Date('2030-01-01T10:00:00Z');
    const { servico, tx } = montar(
      { fixadaEm: antes },
      LIMITE_CONVERSAS_FIXADAS,
    );
    const r = await servico.marcarFixada('e1', user, 'c1', true);
    expect(r.fixadaEm).toEqual(antes);
    expect(tx.whatsappConversa.count).not.toHaveBeenCalled();
  });

  it('soltar limpa a fixação', async () => {
    const { servico, tx } = montar({ fixadaEm: new Date() }, 4);
    const r = await servico.marcarFixada('e1', user, 'c1', false);
    expect(r.fixadaEm).toBeNull();
    expect(
      (tx.whatsappConversa.update.mock.calls as unknown[][])[0][0],
    ).toMatchObject({ data: { fixadaEm: null } });
  });
});

describe('WhatsappEtiquetasService', () => {
  const montar = (tx: Record<string, unknown>) => {
    const prisma = {
      withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx),
    };
    const conversas = {
      conversaNoEscopoPublica: jest
        .fn()
        .mockResolvedValue({ id: 'c1', contatoId: 'ct1' }),
    };
    return new WhatsappEtiquetasService(prisma as never, conversas as never);
  };

  it('define as etiquetas só do usuário, sem tocar nas de outros', async () => {
    const tx = {
      whatsappEtiqueta: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]) // são dele
          .mockResolvedValueOnce([]), // devolução final
      },
      whatsappContatoEtiqueta: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    await montar(tx).definirDaConversa('e1', user, 'c1', ['a', 'b', 'a']);

    // Remove só as dele — a etiqueta de outro usuário no mesmo contato fica.
    expect(
      (tx.whatsappContatoEtiqueta.deleteMany.mock.calls as unknown[][])[0][0],
    ).toEqual({
      where: { contatoId: 'ct1', etiqueta: { usuarioId: 'u1' } },
    });
    const criadas = (
      tx.whatsappContatoEtiqueta.createMany.mock.calls as [
        { data: { etiquetaId: string }[] },
      ][]
    )[0][0].data;
    expect(criadas.map((c) => c.etiquetaId)).toEqual(['a', 'b']);
  });

  it('recusa etiqueta que não é do usuário', async () => {
    const tx = {
      whatsappEtiqueta: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a' }]),
      },
      whatsappContatoEtiqueta: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    await expect(
      montar(tx).definirDaConversa('e1', user, 'c1', ['a', 'de-outro']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsappContatoEtiqueta.deleteMany).not.toHaveBeenCalled();
  });

  it('nome repetido vira conflito legível', async () => {
    const duplicada = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const tx = {
      whatsappEtiqueta: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockRejectedValue(duplicada),
      },
    };
    await expect(
      montar(tx).criar('e1', user, { nome: 'VIP', cor: 'azul' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recusa passar de 30 etiquetas por usuário', async () => {
    const tx = {
      whatsappEtiqueta: {
        count: jest.fn().mockResolvedValue(30),
        create: jest.fn(),
      },
    };
    await expect(
      montar(tx).criar('e1', user, { nome: 'Nova', cor: 'azul' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsappEtiqueta.create).not.toHaveBeenCalled();
  });

  it('só exclui etiqueta do próprio usuário', async () => {
    const tx = {
      whatsappEtiqueta: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    await expect(
      montar(tx).excluir('e1', user, 'alheia'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (tx.whatsappEtiqueta.deleteMany.mock.calls as unknown[][])[0][0],
    ).toEqual({ where: { id: 'alheia', empresaId: 'e1', usuarioId: 'u1' } });
  });
});
