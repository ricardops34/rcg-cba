import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) return false;
    if (user.isAdmin) return true;
    // required é um OR: qualquer uma das permissões listadas libera o acesso
    // (ver RequirePermission — alternativas cobrem rotas alcançáveis por
    // mais de uma tela/permissão).
    if (!required.some((permissao) => user.permissoes.includes(permissao))) {
      throw new ForbiddenException(
        `Usuário não possui nenhuma das permissões: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
