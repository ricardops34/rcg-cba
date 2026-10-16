import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PlataformaService } from './plataforma.service';

const ator = { id: 'ator', email: 'ator@plataforma.com' };

describe('PlataformaService.criarEmpresa — conta que já tem grupo', () => {
  const entrada = {
    razaoSocial: 'Filial Ltda',
    nomeFantasia: 'Filial',
    cnpj: '11222333000181',
    tipoPessoa: 'juridica',
    situacao: 'teste',
    testeExpiraEm: '2026-11-01T00:00:00.000Z',
    limiteUsuarios: 99,
    admin: { email: 'admin@cliente.com' },
  } as never;

  function montar(contrato: unknown, empresasNoGrupo: number) {
    const tx = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      assinatura: { findUnique: jest.fn().mockResolvedValue(contrato) },
      empresa: {
        count: jest.fn().mockResolvedValue(empresasNoGrupo),
        create: jest.fn(({ data }) =>
          Promise.resolve({ id: 'nova', grupoEconomicoId: 'g', ...data }),
        ),
      },
      perfil: { findFirst: jest.fn().mockResolvedValue({ id: 'padm' }) },
      usuarioEmpresa: { create: jest.fn() },
      usuario: { update: jest.fn() },
      plataformaAuditoria: { create: jest.fn() },
    };
    const prisma = {
      empresa: { findUnique: jest.fn().mockResolvedValue(null) },
      usuario: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conta',
          nome: 'Admin',
          grupoEconomicoId: 'g',
          perfil: { sistemaBase: true, administraPlataforma: false },
        }),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return { service: new PlataformaService(prisma as never), tx };
  }

  const plano = {
    nome: 'Básico',
    limiteEmpresas: 2,
    limiteUsuarios: 5,
    deletedAt: null,
  };

  it('entra no contrato do grupo: situação e limite de usuários dele', async () => {
    const { service, tx } = montar({ situacao: 'ativa', plano }, 1);

    await service.criarEmpresa(entrada, ator);

    expect(tx.empresa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        situacao: 'ativa',
        testeExpiraEm: null,
        limiteUsuarios: 5,
      }) as unknown,
    });
  });

  it('recusa passar do limite de empresas do plano', async () => {
    const { service, tx } = montar({ situacao: 'ativa', plano }, 2);

    await expect(service.criarEmpresa(entrada, ator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.empresa.create).not.toHaveBeenCalled();
  });

  it('recusa grupo sem contrato ativo', async () => {
    const { service } = montar(null, 0);

    await expect(service.criarEmpresa(entrada, ator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PlataformaService.desvincularAdministrador', () => {
  function montar(vinculo: unknown, admins: number) {
    const tx = {
      $executeRaw: jest.fn(),
      usuarioEmpresa: {
        findUnique: jest.fn().mockResolvedValue(vinculo),
        count: jest.fn().mockResolvedValue(admins),
        update: jest.fn(),
      },
      plataformaAuditoria: { create: jest.fn() },
    };
    const prisma = {
      empresa: {
        findFirst: jest.fn().mockResolvedValue({ id: 'e1', razaoSocial: 'E1' }),
      },
      perfil: { findFirst: jest.fn().mockResolvedValue({ id: 'padm' }) },
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    return { service: new PlataformaService(prisma as never), tx };
  }

  it('não remove por aqui quem não é administrador', async () => {
    const { service, tx } = montar(
      { ativo: true, usuario: { email: 'v@x.com', perfilId: 'vendedor' } },
      3,
    );

    await expect(
      service.desvincularAdministrador('e1', 'u1', ator),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.usuarioEmpresa.update).not.toHaveBeenCalled();
  });

  it('trava a empresa antes de contar e recusa o último administrador', async () => {
    const { service, tx } = montar(
      { ativo: true, usuario: { email: 'a@x.com', perfilId: 'padm' } },
      1,
    );

    await expect(
      service.desvincularAdministrador('e1', 'u1', ator),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.usuarioEmpresa.update).not.toHaveBeenCalled();
  });
});

describe('PlataformaService.definirAdmin — revogação', () => {
  it('confere o último administrador dentro da transação, com trava', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      usuario: { count: jest.fn().mockResolvedValue(1), update: jest.fn() },
      plataformaAuditoria: { create: jest.fn() },
    };
    const prisma = {
      usuario: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u2', nome: 'B', email: 'b@x.com' }),
        // Fora da transação ainda se viam dois: o outro acabou de ser revogado.
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', ultimoLogin: null },
          { id: 'u2', ultimoLogin: null },
        ]),
      },
      perfil: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pplat' }),
      },
      withUsuario: jest.fn().mockResolvedValue(null),
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new PlataformaService(prisma as never);

    await expect(
      service.definirAdmin('u2', false, ator),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
});
