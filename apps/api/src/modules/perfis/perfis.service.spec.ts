import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PerfisService } from './perfis.service';

describe('PerfisService — rotinas administrativas', () => {
  function montar(sistemaBase: boolean) {
    const prisma = {
      perfil: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'perfil-1',
          sistemaBase,
          permissoes: [],
        }),
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

  it('recusa conceder rotina de Administração a perfil não Admin', async () => {
    const { service, prisma } = montar(false);
    prisma.rotina.findFirst.mockResolvedValue({ nome: 'Parâmetros' });

    await expect(
      service.updatePermissoes('perfil-1', permissaoParametros, 'admin-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.perfilPermissao.upsert).not.toHaveBeenCalled();
  });

  it('permite a rotina de Administração ao perfil Admin base', async () => {
    const { service, prisma } = montar(true);

    await service.updatePermissoes('perfil-1', permissaoParametros, 'admin-1');

    expect(prisma.rotina.findFirst).not.toHaveBeenCalled();
    expect(prisma.perfilPermissao.upsert).toHaveBeenCalled();
  });
});
