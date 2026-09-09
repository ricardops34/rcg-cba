import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ToursService } from './tours.service';

describe('ToursService', () => {
  const user: AuthenticatedUser = {
    id: 'usuario-1',
    nome: 'Usuário',
    email: 'usuario@teste.com',
    empresaAtivaId: 'empresa-1',
    isAdmin: false,
    permissoes: [],
  };
  const execucao = {
    id: '8f431731-d58c-4b66-9802-d14319235b44',
    empresaId: 'empresa-1',
    usuarioId: 'usuario-1',
    tourCodigo: 'inicio',
    versao: 1,
    origem: 'automatico' as const,
    status: 'em_andamento' as const,
    passoAtual: 0,
    iniciadoEm: new Date('2026-09-09T14:00:00.000Z'),
    finalizadoEm: null,
    updatedAt: new Date('2026-09-09T14:00:00.000Z'),
  };

  let service: ToursService;
  let tx: {
    tourExecucao: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      findFirstOrThrow: jest.Mock;
    };
  };
  let prisma: { withTenant: jest.Mock };

  beforeEach(() => {
    tx = {
      tourExecucao: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        findFirstOrThrow: jest.fn(),
      },
    };
    prisma = {
      withTenant: jest.fn(
        (
          _empresaId: string,
          callback: (client: typeof tx) => unknown,
        ): unknown => callback(tx),
      ),
    };
    service = new ToursService(prisma as unknown as PrismaService);
  });

  it('solicita o tour automático somente quando a versão nunca foi exibida', async () => {
    tx.tourExecucao.findFirst.mockResolvedValueOnce(null);
    await expect(service.estado(user, 'inicio', 1)).resolves.toEqual({
      deveIniciarAutomaticamente: true,
      ultimaExecucao: null,
    });

    tx.tourExecucao.findFirst.mockResolvedValueOnce(execucao);
    const repetido = await service.estado(user, 'inicio', 1);
    expect(repetido.deveIniciarAutomaticamente).toBe(false);
    expect(prisma.withTenant).toHaveBeenCalledWith(
      'empresa-1',
      expect.any(Function),
    );
  });

  it('não duplica uma inicialização automática concorrente', async () => {
    tx.tourExecucao.findFirst.mockResolvedValue(execucao);

    const resultado = await service.iniciar(user, 'inicio', {
      versao: 1,
      origem: 'automatico',
    });

    expect(resultado.id).toBe(execucao.id);
    expect(tx.tourExecucao.create).not.toHaveBeenCalled();
  });

  it('atualiza somente a execução do usuário e empresa ativos', async () => {
    tx.tourExecucao.updateMany.mockResolvedValue({ count: 1 });
    tx.tourExecucao.findFirstOrThrow.mockResolvedValue({
      ...execucao,
      status: 'concluido',
      finalizadoEm: new Date('2026-09-09T14:05:00.000Z'),
    });

    await service.atualizar(user, execucao.id, {
      passoAtual: 11,
      status: 'concluido',
    });

    expect(tx.tourExecucao.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: execucao.id,
          empresaId: 'empresa-1',
          usuarioId: 'usuario-1',
        },
      }),
    );
  });

  it('recusa alterar uma execução fora do escopo', async () => {
    tx.tourExecucao.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.atualizar(user, execucao.id, {
        passoAtual: 2,
        status: 'em_andamento',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
