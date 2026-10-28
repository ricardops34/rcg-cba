import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PlanoDisponibilidadeService } from '../plano/plano-disponibilidade.service';

/** `clientes.visualizar` → `clientes`; `relatorio-vendas.exportar` → `relatorio-vendas`. */
const codigoDaRotina = (permissao: string) =>
  permissao.slice(0, permissao.lastIndexOf('.'));

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plano: PlanoDisponibilidadeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    // required é um OR: qualquer uma das permissões listadas libera o acesso
    // (ver RequirePermission — alternativas cobrem rotas alcançáveis por
    // mais de uma tela/permissão).
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) return false;

    // O plano contratado vale para todos, inclusive o administrador da empresa:
    // antes só o menu o respeitava, e a rota fora do plano seguia respondendo por
    // chamada direta (SEC-04). Fica **antes** do atalho do `isAdmin`. Só quem
    // administra a plataforma passa por cima — é quem mantém os planos, e entra
    // na empresa do cliente para dar suporte.
    if (!user.administradorPlataforma && user.empresaAtivaId) {
      const fora = await this.plano.rotinasForaDoPlano(user.empresaAtivaId);
      // `required` é "qualquer uma destas": só nega se **todas** estão fora.
      if (fora.size > 0 && required.every((p) => fora.has(codigoDaRotina(p)))) {
        throw new ForbiddenException(
          'Este recurso não está disponível no plano da sua empresa.',
        );
      }
    }

    if (user.isAdmin) return true;
    if (!required.some((permissao) => user.permissoes.includes(permissao))) {
      throw new ForbiddenException(
        `Usuário não possui nenhuma das permissões: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
