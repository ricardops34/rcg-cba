import { NotFoundException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

/**
 * SEC-01: a empresa de destino do vínculo vem da URL e precisa estar no alcance
 * do ator (a empresa ativa dele e as do mesmo grupo) — a regra do desvincular.
 */
describe('UsuariosService.vincularEmpresa — alcance do ator', () => {
  const CHEGOU = new Error('chegou na transação');

  const montar = () => {
    const prisma = {
      // A empresa ativa do ator é do grupo G1, que tem as empresas A (ativa) e B.
      empresa: {
        findUnique: jest.fn().mockResolvedValue({ grupoEconomicoId: 'G1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'A' }, { id: 'B' }]),
      },
      usuario: {
        findFirst: jest.fn().mockResolvedValue({ perfil: { administraPlataforma: false } }),
      },
      // Se o alcance passou, o código segue para a transação do tenant da URL.
      withTenant: jest.fn().mockRejectedValue(CHEGOU),
    };
    const servico = new UsuariosService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { servico, prisma };
  };

  const dto = { perfilId: 'p1' } as never;

  it('empresa de outro grupo: 404, sem abrir transação no tenant da URL', async () => {
    const { servico, prisma } = montar();
    await expect(
      servico.vincularEmpresa('u1', 'OUTRO-GRUPO', dto, 'ator', false, 'A'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('empresa irmã do mesmo grupo: segue (o grupo é a unidade de administração)', async () => {
    const { servico, prisma } = montar();
    await expect(servico.vincularEmpresa('u1', 'B', dto, 'ator', false, 'A')).rejects.toBe(CHEGOU);
    expect(prisma.withTenant).toHaveBeenCalledWith('B', expect.any(Function));
  });

  it('a própria empresa ativa: segue', async () => {
    const { servico } = montar();
    await expect(servico.vincularEmpresa('u1', 'A', dto, 'ator', false, 'A')).rejects.toBe(CHEGOU);
  });

  it('sem a empresa ativa do ator não há como medir o alcance: recusa', async () => {
    const { servico, prisma } = montar();
    await expect(
      servico.vincularEmpresa('u1', 'A', dto, 'ator', false, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('o administrador da plataforma opera fora do alcance', async () => {
    const { servico } = montar();
    await expect(
      servico.vincularEmpresa('u1', 'OUTRO-GRUPO', dto, 'plat', true, undefined),
    ).rejects.toBe(CHEGOU);
  });

  it('não dá acesso a conta de plataforma a quem não é da plataforma', async () => {
    const { servico, prisma } = montar();
    prisma.usuario.findFirst.mockResolvedValue({ perfil: { administraPlataforma: true } });
    await expect(servico.vincularEmpresa('alvo', 'A', dto, 'ator', false, 'A')).rejects.toThrow(
      /plataforma/,
    );
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });
});
