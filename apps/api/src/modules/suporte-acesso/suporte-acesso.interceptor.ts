import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, switchMap, type Observable } from 'rxjs';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SuporteAcessoService } from './suporte-acesso.service';

/** Campo do corpo cujo valor não vai para o log que o cliente lê. */
const PARECE_SEGREDO = /senha|password|token|secret|segredo|apikey|chave/i;

/** Rotas que a sessão de suporte usa mesmo sem liberação: sair, renovar, `me`. */
const SEMPRE_LIBERADAS = /^\/auth(\/|$)/;

const LIMITE_CORPO = 2000;

/** Copia o corpo trocando o valor dos campos com cara de segredo. */
export function mascararSegredos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(mascararSegredos);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [
        chave,
        PARECE_SEGREDO.test(chave) && v != null && v !== ''
          ? '***'
          : mascararSegredos(v),
      ]),
    );
  }
  return valor;
}

/** O caminho sem o prefixo global (`/api/v1/clientes` → `/clientes`). */
export function caminhoDaRota(caminho: string) {
  return caminho.replace(/^\/api(\/v\d+)?(?=\/|$)/, '') || '/';
}

/**
 * Sessão de suporte da plataforma no ambiente de um cliente (token com
 * `suporte`, emitido por "Entrar como suporte"): a cada requisição confere que
 * o cliente ainda libera o acesso — revogar vale na hora — e grava a ação no
 * log que ele lê em Administração > Suporte.
 *
 * É interceptor, e não guard, de propósito: guards globais rodam **antes** do
 * `JwtAuthGuard` dos controllers, quando o usuário ainda não existe. O guard
 * anterior fazia exatamente isso e liberava tudo, sem log (ver
 * docs/planos/2026-10-16-entrar-como-suporte.md). Interceptors rodam depois de
 * todos os guards.
 */
@Injectable()
export class SuporteAcessoInterceptor implements NestInterceptor {
  constructor(private readonly suporte: SuporteAcessoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.suporteAcessoId) return next.handle();

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
    // Lança 403 se o cliente revogou ou a liberação venceu.
    const concessao = await this.suporte.validarAcessoSuporteAtivo(
      user.empresaAtivaId,
    );
    const corpo =
      request.body && Object.keys(request.body as object).length > 0
        ? JSON.stringify(mascararSegredos(request.body))
        : undefined;
    await this.suporte.registrarLogSuporte({
      empresaId: user.empresaAtivaId,
      suporteAcessoId: concessao.id,
      usuarioPlataformaId: user.id,
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
