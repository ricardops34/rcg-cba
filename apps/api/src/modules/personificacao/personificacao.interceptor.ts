import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, switchMap, type Observable } from 'rxjs';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  caminhoDaRota,
  mascararSegredos,
} from '../suporte-acesso/suporte-acesso.interceptor';
import { PersonificacaoService } from './personificacao.service';

/** Rotas que a sessão de personificação usa mesmo fora do próprio log: sair, `me`. */
const SEMPRE_LIBERADAS = /^\/auth(\/|$)/;

const LIMITE_CORPO = 2000;

/**
 * Sessão de personificação ("Testar como este usuário", token com
 * `personificadoPor`): grava cada ação do administrador no log que
 * Administração > Personificação de Usuários lê — mesmo molde do
 * `SuporteAcessoInterceptor`, mas sem liberação prévia para checar: a trava
 * aqui é só a permissão de quem iniciou (`usuarios.editar`, conferida no
 * `POST /usuarios/:id/personificar`).
 *
 * Interceptor, e não guard, pelo mesmo motivo do de suporte: guards globais
 * rodam antes do `JwtAuthGuard`, quando `request.user` ainda não existe.
 */
@Injectable()
export class PersonificacaoInterceptor implements NestInterceptor {
  constructor(private readonly personificacao: PersonificacaoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.personificadoPorId) return next.handle();

    const rota = caminhoDaRota(request.path || request.url);
    if (SEMPRE_LIBERADAS.test(rota)) return next.handle();

    return from(this.registrar(request, user, rota)).pipe(
      switchMap(() => next.handle()),
    );
  }

  private async registrar(
    request: Request,
    user: AuthenticatedUser,
    rota: string,
  ) {
    const corpo =
      request.body && Object.keys(request.body as object).length > 0
        ? JSON.stringify(mascararSegredos(request.body))
        : undefined;
    await this.personificacao.registrarLog({
      empresaId: user.empresaAtivaId,
      administradorId: user.personificadoPorId!,
      usuarioAlvoId: user.id,
      metodoHttp: request.method,
      rota,
      payload:
        corpo && corpo.length > LIMITE_CORPO
          ? `${corpo.slice(0, LIMITE_CORPO)}...`
          : corpo,
      ip: request.ip,
      userAgent: request.headers?.['user-agent'],
    });
  }
}
