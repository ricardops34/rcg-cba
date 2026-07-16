import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

function buildContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    nome: 'Fulano',
    email: 'fulano@teste.com',
    empresaAtivaId: 'empresa-1',
    isAdmin: false,
    permissoes: [],
    ...overrides,
  };
}

describe('PermissionsGuard', () => {
  function buildGuard(required: string | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('libera quando a rota não exige permissão', () => {
    const guard = buildGuard(undefined);
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('bloqueia quando não há usuário autenticado na request', () => {
    const guard = buildGuard('clientes.visualizar');
    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it('libera admin mesmo sem a permissão explícita na lista', () => {
    const guard = buildGuard('clientes.excluir');
    const user = buildUser({ isAdmin: true, permissoes: [] });
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('libera quando o usuário possui a permissão exigida', () => {
    const guard = buildGuard('clientes.visualizar');
    const user = buildUser({ permissoes: ['clientes.visualizar'] });
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('lança ForbiddenException quando falta a permissão exigida', () => {
    const guard = buildGuard('clientes.excluir');
    const user = buildUser({ permissoes: ['clientes.visualizar'] });
    expect(() => guard.canActivate(buildContext(user))).toThrow(
      "Usuário não possui a permissão 'clientes.excluir'",
    );
  });
});
