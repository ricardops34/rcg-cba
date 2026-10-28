import { ForbiddenException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

/**
 * SEC-02: conta de plataforma (perfil com `administraPlataforma`) só é alterada
 * por quem também é da plataforma. Antes só o RLS por grupo separava as duas.
 */
describe('UsuariosService — conta de plataforma protegida', () => {
  const montar = (alvoEhPlataforma: boolean) => {
    const prisma = {
      usuario: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'alvo',
          senhaHash: 'h',
          nome: 'N',
          email: 'e',
          perfil: { administraPlataforma: alvoEhPlataforma },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ usuario: { update: jest.fn() }, usuarioHorario: { deleteMany: jest.fn(), createMany: jest.fn() } }),
      ),
    };
    const acessos = { encerrarSessoesDoUsuario: jest.fn().mockResolvedValue(undefined) };
    const politica = {
      validarSenhaDoUsuario: jest.fn(),
      validarReuso: jest.fn(),
      registrarHistorico: jest.fn(),
      gerarSenhaProvisoria: jest.fn().mockResolvedValue('Prov#1234'),
    };
    const entrega = { entregar: jest.fn().mockResolvedValue({}) };
    const servico = new UsuariosService(
      prisma as never,
      politica as never,
      { obter: jest.fn().mockResolvedValue({}), invalidar: jest.fn() } as never,
      entrega as never,
      acessos as never,
    );
    jest.spyOn(servico, 'findOne').mockResolvedValue({} as never);
    return { servico, prisma };
  };

  const ROTAS: [string, (s: UsuariosService, plataforma: boolean) => Promise<unknown>][] = [
    ['editar', (s, p) => s.update('alvo', { nome: 'X' } as never, 'ator', p)],
    ['redefinir a senha', (s, p) => s.resetSenha('alvo', { novaSenha: 'Nova#Senha1', deveTrocarSenha: true } as never, 'ator', p)],
    ['enviar senha provisória', (s, p) => s.enviarSenhaProvisoria('alvo', 'emp', 'ator', p)],
    ['excluir', (s, p) => s.remove('alvo', 'ator', p)],
    ['salvar horários', (s, p) => s.salvarHorarios('alvo', { horarios: [] } as never, 'ator', p)],
  ];

  it.each(ROTAS)('%s: administrador de empresa não altera conta de plataforma', async (_nome, chamar) => {
    const { servico, prisma } = montar(true);
    await expect(chamar(servico, false)).rejects.toBeInstanceOf(ForbiddenException);
    // Nada foi gravado.
    expect(prisma.usuario.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(ROTAS)('%s: o administrador da plataforma segue podendo', async (_nome, chamar) => {
    const { servico } = montar(true);
    await expect(chamar(servico, true)).resolves.not.toThrow();
  });

  it.each(ROTAS)('%s: conta comum não é afetada pela trava', async (_nome, chamar) => {
    const { servico } = montar(false);
    await expect(chamar(servico, false)).resolves.not.toThrow();
  });

  it('chamar sem informar o ator vale como "não é da plataforma" (padrão seguro)', async () => {
    const { servico } = montar(true);
    await expect(servico.remove('alvo', 'ator')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
