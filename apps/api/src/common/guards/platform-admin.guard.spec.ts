import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

const contexto = (administradorPlataforma: boolean) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: { administradorPlataforma } }),
    }),
  }) as unknown as ExecutionContext;

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('permite administrador da plataforma', () => {
    expect(guard.canActivate(contexto(true))).toBe(true);
  });

  it('recusa administrador apenas do tenant', () => {
    expect(() => guard.canActivate(contexto(false))).toThrow(
      ForbiddenException,
    );
  });
});
