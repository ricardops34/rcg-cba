import { UsuariosService } from './usuarios.service';

/**
 * SEC-03: inativar, excluir ou trocar a senha de alguém precisa derrubar as
 * sessões dele — senão ele segue se renovando com o refresh token que já tem.
 */
describe('UsuariosService — sessões derrubadas', () => {
  const montar = () => {
    const prisma = {
      usuario: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1', senhaHash: 'h', nome: 'N', email: 'e' }),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ usuario: { update: jest.fn() } })),
    };
    const acessos = { encerrarSessoesDoUsuario: jest.fn().mockResolvedValue(undefined) };
    const politica = {
      validarSenhaDoUsuario: jest.fn(),
      validarReuso: jest.fn(),
      registrarHistorico: jest.fn(),
    };
    const servico = new UsuariosService(
      prisma as never,
      politica as never,
      {} as never,
      {} as never,
      acessos as never,
    );
    // `findOne` confere o vínculo com a empresa; aqui só interessa o que vem depois.
    jest.spyOn(servico, 'findOne').mockResolvedValue({} as never);
    return { servico, prisma, acessos };
  };

  it('inativar a conta revoga os tokens e fecha as sessões', async () => {
    const { servico, prisma, acessos } = montar();
    await servico.update('u1', { ativo: false } as never, 'admin');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(acessos.encerrarSessoesDoUsuario).toHaveBeenCalledWith('u1', 'conta_inativada');
  });

  it('editar sem inativar não derruba ninguém', async () => {
    const { servico, prisma, acessos } = montar();
    await servico.update('u1', { nome: 'Novo' } as never, 'admin');
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(acessos.encerrarSessoesDoUsuario).not.toHaveBeenCalled();
  });

  it('excluir a conta derruba as sessões', async () => {
    const { servico, acessos } = montar();
    await servico.remove('u1', 'admin');
    expect(acessos.encerrarSessoesDoUsuario).toHaveBeenCalledWith('u1', 'conta_excluida');
  });

  it('redefinir a senha por um administrador derruba as sessões', async () => {
    const { servico, acessos } = montar();
    await servico.resetSenha('u1', { novaSenha: 'Nova#Senha1', deveTrocarSenha: true } as never, 'admin');
    expect(acessos.encerrarSessoesDoUsuario).toHaveBeenCalledWith('u1', 'senha_redefinida');
  });
});
