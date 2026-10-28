import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * O refresh token no cookie `HttpOnly` (SEC-11): o controller grava no login e
 * na renovação, lê do cookie quando o corpo não traz, e limpa em falha e no
 * logout.
 */
describe('AuthController — cookie do refresh token', () => {
  const montar = (servico: Record<string, jest.Mock>) => {
    const controller = new AuthController(servico as never);
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    const req = (cookie?: string) =>
      ({ ip: '1.1.1.1', headers: cookie ? { cookie, 'user-agent': 't' } : { 'user-agent': 't' } }) as never;
    return { controller, res: res as never, resMock: res, req };
  };

  it('login grava o cookie com o refresh token', async () => {
    const { controller, res, resMock, req } = montar({
      login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r1' }),
    });
    const corpo = await controller.login({ email: 'x', senha: 'y' } as never, req(), res);
    expect(resMock.cookie).toHaveBeenCalledWith('rt', 'r1', expect.objectContaining({ httpOnly: true }));
    // O token só vai no cookie: o corpo que o JavaScript recebe não o traz.
    expect(corpo).toEqual({ accessToken: 'a' });
    expect(JSON.stringify(corpo)).not.toContain('r1');
  });

  it('refresh sem corpo usa o cookie e grava o novo', async () => {
    const refresh = jest.fn().mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
    const { controller, res, resMock, req } = montar({ refresh });
    await controller.refresh({} as never, req('rt=r1'), res);
    expect(refresh).toHaveBeenCalledWith({ refreshToken: 'r1' }, expect.anything());
    expect(resMock.cookie).toHaveBeenCalledWith('rt', 'r2', expect.anything());
  });

  it('refresh sem corpo nem cookie é 401', async () => {
    const { controller, res, req } = montar({ refresh: jest.fn() });
    await expect(controller.refresh({} as never, req(), res)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh recusado apaga o cookie', async () => {
    const { controller, res, resMock, req } = montar({
      refresh: jest.fn().mockRejectedValue(new UnauthorizedException('inválido')),
    });
    await expect(controller.refresh({} as never, req('rt=ruim'), res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resMock.clearCookie).toHaveBeenCalledWith('rt', expect.objectContaining({ path: '/api/v1/auth' }));
  });

  it('logout revoga o token do cookie e apaga o cookie', async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const { controller, res, resMock, req } = montar({ logout });
    await controller.logout({} as never, req('rt=r9'), res);
    expect(logout).toHaveBeenCalledWith({ refreshToken: 'r9' });
    expect(resMock.clearCookie).toHaveBeenCalled();
  });

  it('logout sem token só apaga o cookie', async () => {
    const logout = jest.fn();
    const { controller, res, resMock, req } = montar({ logout });
    await expect(controller.logout({} as never, req(), res)).resolves.toEqual({ success: true });
    expect(logout).not.toHaveBeenCalled();
    expect(resMock.clearCookie).toHaveBeenCalled();
  });
});
