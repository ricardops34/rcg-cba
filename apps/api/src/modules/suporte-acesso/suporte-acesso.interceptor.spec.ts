import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  SuporteAcessoInterceptor,
  caminhoDaRota,
  mascararSegredos,
} from './suporte-acesso.interceptor';

function contexto(request: Record<string, unknown>) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function montar(concessao: { id: string } | null) {
  const suporte = {
    validarAcessoSuporteAtivo: jest.fn(() =>
      concessao
        ? Promise.resolve(concessao)
        : Promise.reject(new ForbiddenException('bloqueado')),
    ),
    registrarLogSuporte: jest.fn().mockResolvedValue(undefined),
  };
  const handler = { handle: jest.fn(() => of('resposta')) };
  return {
    interceptor: new SuporteAcessoInterceptor(suporte as never),
    suporte,
    handler,
  };
}

const sessaoDeSuporte = {
  id: 'admin',
  empresaAtivaId: 'cliente',
  suporteAcessoId: 'liberacao',
};

describe('SuporteAcessoInterceptor', () => {
  it('tira o prefixo global da rota e mascara campos de senha e token', () => {
    expect(caminhoDaRota('/api/v1/clientes/1')).toBe('/clientes/1');
    expect(caminhoDaRota('/api/auth/me')).toBe('/auth/me');
    expect(
      mascararSegredos({
        nome: 'x',
        novaSenha: 'abc',
        itens: [{ token: 't', valor: 1 }],
        smtp: { senha: '' },
      }),
    ).toEqual({
      nome: 'x',
      novaSenha: '***',
      itens: [{ token: '***', valor: 1 }],
      smtp: { senha: '' },
    });
  });

  it('sessão comum passa direto, sem conferir liberação nem gravar log', async () => {
    const { interceptor, suporte, handler } = montar({ id: 'liberacao' });
    await lastValueFrom(
      interceptor.intercept(
        contexto({
          user: { id: 'u', empresaAtivaId: 'e' },
          path: '/api/v1/clientes',
        }),
        handler,
      ),
    );
    expect(suporte.validarAcessoSuporteAtivo).not.toHaveBeenCalled();
    expect(handler.handle).toHaveBeenCalled();
  });

  it('sessão de suporte com liberação: grava a ação com o corpo mascarado', async () => {
    const { interceptor, suporte, handler } = montar({ id: 'liberacao-atual' });
    await lastValueFrom(
      interceptor.intercept(
        contexto({
          user: sessaoDeSuporte,
          path: '/api/v1/usuarios/9/senha',
          method: 'PATCH',
          body: { novaSenha: 'segredo' },
          ip: '1.1.1.1',
          headers: {},
        }),
        handler,
      ),
    );
    expect(suporte.registrarLogSuporte).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'cliente',
        suporteAcessoId: 'liberacao-atual',
        rota: '/usuarios/9/senha',
        metodoHttp: 'PATCH',
        payload: '{"novaSenha":"***"}',
      }),
    );
    expect(handler.handle).toHaveBeenCalled();
  });

  it('liberação revogada ou vencida: 403 e a rota não roda', async () => {
    const { interceptor, handler } = montar(null);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contexto({
            user: sessaoDeSuporte,
            path: '/api/v1/clientes',
            headers: {},
          }),
          handler,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('sem liberação, as rotas de /auth seguem — para sair do ambiente do cliente', async () => {
    const { interceptor, suporte, handler } = montar(null);
    await lastValueFrom(
      interceptor.intercept(
        contexto({
          user: sessaoDeSuporte,
          path: '/api/v1/auth/switch-empresa',
        }),
        handler,
      ),
    );
    expect(suporte.validarAcessoSuporteAtivo).not.toHaveBeenCalled();
    expect(handler.handle).toHaveBeenCalled();
  });
});
