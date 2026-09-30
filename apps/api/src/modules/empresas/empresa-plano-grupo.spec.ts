import { EmpresasService } from './empresas.service';

describe('empresa criada pelo administrador do grupo', () => {
  function setup(total = 1) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'g' }]),
      $executeRaw: jest.fn(),
      assinatura: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            situacao: 'ativa',
            plano: {
              nome: 'Pro',
              limiteEmpresas: 2,
              limiteUsuarios: 10,
              deletedAt: null,
            },
          }),
      },
      empresa: {
        count: jest.fn().mockResolvedValue(total),
        findUnique: jest.fn().mockResolvedValue({ testeExpiraEm: null }),
        create: jest.fn().mockResolvedValue({ id: 'nova' }),
      },
      usuarioEmpresa: { create: jest.fn() },
    };
    const prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ grupoEconomicoId: 'g' }),
      },
      empresa: { findUnique: jest.fn().mockResolvedValue(null) },
      perfil: { findFirst: jest.fn().mockResolvedValue({ id: 'admin' }) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new EmpresasService(prisma as never);
    const user = { id: 'u', empresaAtivaId: 'origem', isAdmin: true };
    const input = {
      razaoSocial: 'Nova',
      nomeFantasia: 'Nova',
      cnpj: '12345678000190',
      grupoEconomicoId: 'outro',
      limiteUsuarios: 999,
      ePlataforma: true,
    } as never;
    return { tx, prisma, service, user, input };
  }
  it('herda grupo e plano, ignorando campos de privilégio enviados', async () => {
    const { tx, service, user, input } = setup();
    await service.createDoAtor(input, user);
    expect(tx.empresa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grupoEconomicoId: 'g',
        ePlataforma: false,
        situacao: 'ativa',
        limiteUsuarios: 10,
      }),
    });
    // Só o acesso: o perfil é da conta de quem cria (já administrador).
    expect(tx.usuarioEmpresa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 'u',
        empresaId: 'nova',
      }),
    });
  });
  it('não grava empresa nem vínculo quando a cota está cheia', async () => {
    const { tx, service, user, input } = setup(2);
    await expect(service.createDoAtor(input, user)).rejects.toThrow(
      'permite 2',
    );
    expect(tx.empresa.create).not.toHaveBeenCalled();
    expect(tx.usuarioEmpresa.create).not.toHaveBeenCalled();
  });
  it('recusa usuário sem autoridade administrativa', async () => {
    const { prisma, service, user, input } = setup();
    await expect(
      service.createDoAtor(input, { ...user, isAdmin: false }),
    ).rejects.toThrow('Somente administradores');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
