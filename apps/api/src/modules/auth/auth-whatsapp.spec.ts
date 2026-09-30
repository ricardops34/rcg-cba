import { AuthService } from './auth.service';

describe('número de telefone do perfil', () => {
  function setup() {
    const tx = {
      usuarioEmpresa: {
        findUnique: jest.fn().mockResolvedValue({ celular: '65999991234' }),
        update: jest.fn(),
      },
      usuario: { update: jest.fn() },
      whatsappVinculoFuncionario: { deleteMany: jest.fn() },
    };
    const service = Object.assign(Object.create(AuthService.prototype), {
      prisma: { withTenant: jest.fn((_empresa, fn) => fn(tx)) },
      me: jest.fn().mockResolvedValue({ id: 'u' }),
    }) as AuthService;
    return { service, tx };
  }
  it('troca o telefone somente na empresa ativa e invalida a confirmação', async () => {
    const { service, tx } = setup();
    await service.updateOwnProfile('u', 'e', 'Ana', '(65) 98888-1234');
    expect(tx.usuarioEmpresa.update).toHaveBeenCalledWith({
      where: { usuarioId_empresaId: { usuarioId: 'u', empresaId: 'e' } },
      data: { celular: '65988881234', updatedBy: 'u' },
    });
    expect(tx.whatsappVinculoFuncionario.deleteMany).toHaveBeenCalledWith({
      where: { empresaId: 'e', usuarioId: 'u' },
    });
  });
  it('remover o número também invalida a confirmação', async () => {
    const { service, tx } = setup();
    await service.updateOwnProfile('u', 'e', 'Ana', '');
    expect(tx.usuarioEmpresa.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { celular: null, updatedBy: 'u' } }),
    );
    expect(tx.whatsappVinculoFuncionario.deleteMany).toHaveBeenCalled();
  });
  it('alterar apenas nome preserva telefone e pareamento', async () => {
    const { service, tx } = setup();
    await service.updateOwnProfile('u', 'e', 'Ana');
    expect(tx.usuarioEmpresa.update).not.toHaveBeenCalled();
    expect(tx.whatsappVinculoFuncionario.deleteMany).not.toHaveBeenCalled();
  });
});
