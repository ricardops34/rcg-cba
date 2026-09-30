import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PerfisService } from './perfis.service';

const GRUPO = 'grupo-rcg';

const adminEmpresa: AuthenticatedUser = {
  id: 'admin-1',
  nome: 'Admin',
  email: 'admin@rcg',
  empresaAtivaId: 'empresa-rcg',
  isAdmin: true,
  administradorPlataforma: false,
  permissoes: [],
};
const adminPlataforma: AuthenticatedUser = { ...adminEmpresa, administradorPlataforma: true };

function montar(perfil: { sistemaBase?: boolean; grupoEconomicoId?: string | null } | null) {
  const prisma = {
    empresa: {
      findUnique: jest.fn().mockResolvedValue({ grupoEconomicoId: GRUPO }),
    },
    perfil: {
      findFirst: jest.fn().mockResolvedValue(
        perfil && {
          id: 'perfil-1',
          sistemaBase: perfil.sistemaBase ?? false,
          grupoEconomicoId: perfil.grupoEconomicoId ?? null,
          permissoes: [],
        },
      ),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'novo', ...data })),
      update: jest.fn().mockResolvedValue({ id: 'perfil-1' }),
    },
    rotina: { findFirst: jest.fn() },
    perfilPermissao: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return {
    prisma,
    service: new PerfisService(prisma as unknown as PrismaService),
  };
}

const permissaoParametros = {
  permissoes: [
    {
      rotinaId: 'seed-rotina-parametros',
      acao: 'editar' as const,
      permitido: true,
    },
  ],
};
const permissaoClientes = {
  permissoes: [{ rotinaId: 'seed-rotina-clientes', acao: 'aprovar' as const, permitido: true }],
};

describe('PerfisService — rotinas administrativas', () => {
  it('recusa conceder rotina de Administração a perfil não Admin', async () => {
    const { service, prisma } = montar({ grupoEconomicoId: GRUPO });
    prisma.rotina.findFirst.mockResolvedValue({ nome: 'Parâmetros' });

    await expect(
      service.updatePermissoes('perfil-1', permissaoParametros, adminEmpresa),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.perfilPermissao.upsert).not.toHaveBeenCalled();
  });

  it('permite a rotina de Administração ao perfil Admin base', async () => {
    const { service, prisma } = montar({ sistemaBase: true });

    await service.updatePermissoes('perfil-1', permissaoParametros, adminPlataforma);

    expect(prisma.rotina.findFirst).not.toHaveBeenCalled();
    expect(prisma.perfilPermissao.upsert).toHaveBeenCalled();
  });
});

describe('PerfisService — dono do perfil', () => {
  it('o administrador da empresa altera as permissões de um perfil do grupo dele', async () => {
    const { service, prisma } = montar({ grupoEconomicoId: GRUPO });

    await service.updatePermissoes('perfil-1', permissaoClientes, adminEmpresa);

    expect(prisma.perfilPermissao.upsert).toHaveBeenCalled();
  });

  it('o administrador da empresa não altera perfil da plataforma', async () => {
    const { service, prisma } = montar({ grupoEconomicoId: null });

    await expect(
      service.updatePermissoes('perfil-1', permissaoClientes, adminEmpresa),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.update('perfil-1', { nome: 'X' }, adminEmpresa)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remove('perfil-1', adminEmpresa)).rejects.toThrow(ForbiddenException);
    expect(prisma.perfilPermissao.upsert).not.toHaveBeenCalled();
    expect(prisma.perfil.update).not.toHaveBeenCalled();
  });

  it('perfil de outro grupo não é encontrado (a busca filtra pelo grupo da empresa ativa)', async () => {
    const { service, prisma } = montar(null);

    await expect(
      service.updatePermissoes('perfil-1', permissaoClientes, adminEmpresa),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.perfil.findFirst.mock.calls[0][0].where.OR).toEqual([
      { grupoEconomicoId: null },
      { grupoEconomicoId: GRUPO },
    ]);
  });

  it('o administrador da plataforma altera perfil da plataforma', async () => {
    const { service, prisma } = montar({ grupoEconomicoId: null });

    await service.updatePermissoes('perfil-1', permissaoClientes, adminPlataforma);

    expect(prisma.perfilPermissao.upsert).toHaveBeenCalled();
  });

  it('perfil criado pelo administrador da empresa nasce no grupo da empresa ativa', async () => {
    const { service, prisma } = montar(null);

    await service.create({ nome: 'Supervisor', ativo: true, carteiraCompleta: false }, adminEmpresa);

    expect(prisma.perfil.create.mock.calls[0][0].data.grupoEconomicoId).toBe(GRUPO);
  });

  it('perfil criado pelo administrador da plataforma é da plataforma', async () => {
    const { service, prisma } = montar(null);

    await service.create({ nome: 'Supervisor', ativo: true, carteiraCompleta: false }, adminPlataforma);

    expect(prisma.perfil.create.mock.calls[0][0].data.grupoEconomicoId).toBeNull();
  });
});
