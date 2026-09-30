import { AuthService } from './auth.service';

// O WhatsApp é do usuário, igual em todas as empresas do grupo (migration
// 20260930230000_dados_do_usuario): grava em `usuarios`, não no vínculo.
describe('número de telefone do perfil', () => {
  function setup() {
    const tx = {
      usuario: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ celular: '65999991234' }),
        update: jest.fn(),
      },
      whatsappVinculoFuncionario: { deleteMany: jest.fn() },
    };
    const service = Object.assign(Object.create(AuthService.prototype), {
      prisma: { withTenant: jest.fn((_empresa, fn) => fn(tx)) },
      me: jest.fn().mockResolvedValue({ id: 'u' }),
    }) as AuthService;
    return { service, tx };
  }
  it('troca o telefone do usuário e invalida a confirmação', async () => {
    const { service, tx } = setup();
    await service.updateOwnProfile('u', 'e', 'Ana', '(65) 98888-1234');
    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { id: 'u' },
      data: { celular: '65988881234', updatedBy: 'u' },
    });
    expect(tx.whatsappVinculoFuncionario.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u' },
    });
  });
  it('remover o número também invalida a confirmação', async () => {
    const { service, tx } = setup();
    await service.updateOwnProfile('u', 'e', 'Ana', '');
    expect(tx.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { celular: null, updatedBy: 'u' } }),
    );
    expect(tx.whatsappVinculoFuncionario.deleteMany).toHaveBeenCalled();
  });
  it('alterar apenas nome preserva telefone e pareamento', async () => {
    const { service, tx } = setup();
    await service.updateOwnProfile('u', 'e', 'Ana');
    expect(tx.usuario.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celular: expect.anything() }) }),
    );
    expect(tx.whatsappVinculoFuncionario.deleteMany).not.toHaveBeenCalled();
  });
});
