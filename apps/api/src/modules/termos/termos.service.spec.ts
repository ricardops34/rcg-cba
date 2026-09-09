import { ConflictException, NotFoundException } from '@nestjs/common';
import { TermosService } from './termos.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('TermosService', () => {
  const termo = {
    id: '8f431731-d58c-4b66-9802-d14319235b44',
    codigo: 'termos-uso-plataforma',
    versao: '1.0',
    tipo: 'termos_uso' as const,
    titulo: 'Termos de Uso',
    resumo: 'Resumo',
    conteudo: 'Conteúdo',
    conteudoHash: 'a'.repeat(64),
    obrigatorio: true,
    publicadoEm: new Date('2026-09-09T12:00:00.000Z'),
    vigenteEm: new Date('2026-09-09T12:00:00.000Z'),
    revogadoEm: null,
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
  };

  let service: TermosService;
  let prisma: {
    termoDocumento: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    termoAceite: { findMany: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      termoDocumento: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      termoAceite: { findMany: jest.fn(), upsert: jest.fn() },
    };
    service = new TermosService(prisma as unknown as PrismaService);
  });

  it('informa que existe documento obrigatório pendente', async () => {
    prisma.termoDocumento.count.mockResolvedValue(1);

    await expect(service.temPendente('usuario-1')).resolves.toBe(true);
    expect(prisma.termoDocumento.count).toHaveBeenCalledTimes(1);

    // A segunda leitura usa o cache curto do guard.
    await expect(service.temPendente('usuario-1')).resolves.toBe(true);
    expect(prisma.termoDocumento.count).toHaveBeenCalledTimes(1);
  });

  it('lista pendências e histórico de aceites', async () => {
    prisma.termoDocumento.findMany.mockResolvedValue([termo]);
    prisma.termoAceite.findMany.mockResolvedValue([
      {
        termoId: termo.id,
        aceitoEm: new Date('2026-09-09T13:00:00.000Z'),
        termo: {
          codigo: termo.codigo,
          versao: termo.versao,
          titulo: termo.titulo,
        },
      },
    ]);

    const resultado = await service.status('usuario-1');

    expect(resultado.possuiPendencia).toBe(true);
    expect(resultado.pendentes[0].vigenteEm).toBe('2026-09-09T12:00:00.000Z');
    expect(resultado.aceites[0].aceitoEm).toBe('2026-09-09T13:00:00.000Z');
  });

  it('recusa aceite de documento que não está vigente', async () => {
    prisma.termoDocumento.findFirst.mockResolvedValue(null);

    await expect(
      service.aceitar(
        {
          id: 'usuario-1',
          nome: 'Usuário',
          email: 'usuario@teste.com',
          empresaAtivaId: 'empresa-1',
          isAdmin: false,
          permissoes: [],
        },
        termo.id,
        { aceite: true, conteudoHash: termo.conteudoHash },
        {},
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('recusa hash antigo e registra evidências no aceite válido', async () => {
    prisma.termoDocumento.findFirst.mockResolvedValue(termo);

    await expect(
      service.aceitar(
        {
          id: 'usuario-1',
          nome: 'Usuário',
          email: 'usuario@teste.com',
          empresaAtivaId: 'empresa-1',
          isAdmin: false,
          permissoes: [],
        },
        termo.id,
        { aceite: true, conteudoHash: 'b'.repeat(64) },
        {},
      ),
    ).rejects.toThrow(ConflictException);

    prisma.termoAceite.upsert.mockResolvedValue({
      aceitoEm: new Date('2026-09-09T14:00:00.000Z'),
    });
    const resultado = await service.aceitar(
      {
        id: 'usuario-1',
        nome: 'Usuário',
        email: 'usuario@teste.com',
        empresaAtivaId: 'empresa-1',
        isAdmin: false,
        permissoes: [],
      },
      termo.id,
      { aceite: true, conteudoHash: termo.conteudoHash },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(resultado).toEqual({
      aceito: true,
      termoId: termo.id,
      aceitoEm: '2026-09-09T14:00:00.000Z',
    });
    const chamadas = prisma.termoAceite.upsert.mock.calls as unknown as Array<
      [{ create: Record<string, unknown> }]
    >;
    const chamada = chamadas[0][0];
    expect(chamada.create).toEqual(
      expect.objectContaining({
        usuarioId: 'usuario-1',
        empresaContextoId: 'empresa-1',
        ip: '127.0.0.1',
        userAgent: 'jest',
        conteudoHash: termo.conteudoHash,
      }),
    );
  });
});
