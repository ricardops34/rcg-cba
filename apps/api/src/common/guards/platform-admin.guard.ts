import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/** Separa a administraÃ§Ã£o global da administraÃ§Ã£o de uma empresa. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.administradorPlataforma) {
      throw new ForbiddenException(
        'Apenas administradores da plataforma podem alterar o catÃ¡logo global',
      );
    }
    return true;
  }
}
