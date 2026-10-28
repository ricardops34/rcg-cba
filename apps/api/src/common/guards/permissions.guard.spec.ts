import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import type { PlanoDisponibilidadeService } from '../plano/plano-disponibilidade.service';

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
  function buildGuard(required: string | string[] | undefined, foraDoPlano: string[] = []) {
    const lista = required === undefined ? undefined : Array.isArray(required) ? required : [required];
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(lista),
    } as unknown as Reflector;
    const plano = {
      rotinasForaDoPlano: jest.fn().mockResolvedValue(new Set(foraDoPlano)),
    } as unknown as PlanoDisponibilidadeService;
    return new PermissionsGuard(reflector, plano);
  }

  it('libera quando a rota não exige permissão', async () => {
    const guard = buildGuard(undefined);
    await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(true);
  });

  it('bloqueia quando não há usuário autenticado na request', async () => {
    const guard = buildGuard('clientes.visualizar');
    await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(false);
  });

  it('libera admin mesmo sem a permissão explícita na lista', async () => {
    const guard = buildGuard('clientes.excluir');
    const user = buildUser({ isAdmin: true, permissoes: [] });
    await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
  });

  it('libera quando o usuário possui a permissão exigida', async () => {
    const guard = buildGuard('clientes.visualizar');
    const user = buildUser({ permissoes: ['clientes.visualizar'] });
    await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
  });

  it('lança ForbiddenException quando falta a permissão exigida', async () => {
    const guard = buildGuard('clientes.excluir');
    const user = buildUser({ permissoes: ['clientes.visualizar'] });
    await expect(guard.canActivate(buildContext(user))).rejects.toThrow(
      'Usuário não possui nenhuma das permissões: clientes.excluir',
    );
  });

  describe('plano da empresa (SEC-04)', () => {
    it('nega rota fora do plano mesmo para o administrador da empresa', async () => {
      const guard = buildGuard('relatorio-vendas.visualizar', ['relatorio-vendas']);
      const user = buildUser({ isAdmin: true });
      await expect(guard.canActivate(buildContext(user))).rejects.toThrow(
        'não está disponível no plano',
      );
    });

    it('nega rota fora do plano para o usuário comum, mesmo com a permissão', async () => {
      const guard = buildGuard('relatorio-vendas.visualizar', ['relatorio-vendas']);
      const user = buildUser({ permissoes: ['relatorio-vendas.visualizar'] });
      await expect(guard.canActivate(buildContext(user))).rejects.toThrow(
        'não está disponível no plano',
      );
    });

    it('o administrador da plataforma não é barrado pelo plano', async () => {
      const guard = buildGuard('relatorio-vendas.visualizar', ['relatorio-vendas']);
      const user = buildUser({ isAdmin: true, administradorPlataforma: true });
      await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    });

    it('rota dentro do plano segue pela permissão normal', async () => {
      const guard = buildGuard('clientes.visualizar', ['relatorio-vendas']);
      const user = buildUser({ permissoes: ['clientes.visualizar'] });
      await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    });

    it('com alternativas, só nega se todas estão fora do plano', async () => {
      const guard = buildGuard(['a.visualizar', 'b.visualizar'], ['a']);
      const user = buildUser({ permissoes: ['b.visualizar'] });
      await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    });
  });
});
