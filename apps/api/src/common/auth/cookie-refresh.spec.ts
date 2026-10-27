import {
  COOKIE_REFRESH,
  gravarCookieRefresh,
  lerCookie,
  limparCookieRefresh,
} from './cookie-refresh';

const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as never;

describe('cookie do refresh token (SEC-11)', () => {
  it('lê o cookie certo entre vários', () => {
    expect(lerCookie(req('a=1; rt=abc%2Bdef; b=2'), 'rt')).toBe('abc+def');
  });

  it('sem cookie ou com outro nome, nada', () => {
    expect(lerCookie(req(), 'rt')).toBeUndefined();
    expect(lerCookie(req('outro=1'), 'rt')).toBeUndefined();
  });

  it('não confunde nome parecido (xrt ≠ rt)', () => {
    expect(lerCookie(req('xrt=1'), 'rt')).toBeUndefined();
  });

  it('grava HttpOnly, SameSite=Strict e só nas rotas de autenticação', () => {
    const cookie = jest.fn();
    gravarCookieRefresh({ cookie } as never, 'tok');
    expect(cookie).toHaveBeenCalledWith(
      COOKIE_REFRESH,
      'tok',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );
  });

  it('limpa com o mesmo caminho (senão o navegador não apaga)', () => {
    const clearCookie = jest.fn();
    limparCookieRefresh({ clearCookie } as never);
    expect(clearCookie).toHaveBeenCalledWith(
      COOKIE_REFRESH,
      expect.objectContaining({ path: '/api/v1/auth', httpOnly: true }),
    );
  });
});
