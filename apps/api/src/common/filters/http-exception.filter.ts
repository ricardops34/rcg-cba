import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { ErroTipo } from '@prisma/client';
import type { ErrosLogService } from '../../modules/erros/erros-log.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * A própria rota de report do navegador. Um erro nela não pode virar linha no
 * log — o cliente que falhou ao reportar vai tentar de novo, e a tentativa
 * seguinte encontraria mais uma linha para reportar.
 */
const ROTA_REPORT = '/erros/cliente';

/**
 * 401 não entra nem com o interruptor de 4xx ligado: o access token expira a
 * cada poucos minutos e o front renova sozinho, então é o status mais comum
 * da aplicação e não indica defeito nenhum.
 */
const STATUS_IGNORADOS_4XX = [HttpStatus.UNAUTHORIZED];

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  /**
   * Opcional de propósito: o filtro precisa continuar funcionando em teste,
   * onde não há container do Nest para resolver o serviço. Sem ele o
   * comportamento é o de antes — responder o erro e logar no console.
   */
  constructor(private readonly errosLog?: ErrosLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as ZodError;
      this.registrar(request, {
        tipo: ErroTipo.http,
        status: HttpStatus.BAD_REQUEST,
        mensagem: `Dados inválidos: ${zodError.issues
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; ')}`,
      });
      response.status(HttpStatus.BAD_REQUEST).json({
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: zodError.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // O corpo de uma HttpException é `string | object`, e o `object` do Nest
      // costuma trazer `message`. Tipar em vez de `as any` mantém o lint limpo
      // e não muda o que sai na resposta.
      const mensagem: unknown =
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown }).message ?? exception.message);
      this.registrar(request, {
        tipo: ErroTipo.http,
        status,
        mensagem: String(mensagem),
        // 5xx lançado de propósito (ServiceUnavailable de um gateway fora,
        // por exemplo) é falha de sistema e merece o stack.
        stack: status >= 500 ? exception.stack : undefined,
      });
      response.status(status).json({
        code: HttpStatus[status] ?? 'ERROR',
        message: mensagem,
        details: typeof body === 'object' ? body : undefined,
      });
      return;
    }

    this.logger.error(exception);
    this.registrar(request, {
      tipo: ErroTipo.excecao,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      mensagem:
        exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Erro interno inesperado',
    });
  }

  /**
   * Grava no log de erros, se ele estiver disponível.
   *
   * Envolvido em try/catch inteiro porque **um log que lança transforma um
   * erro em dois** — e o segundo, nascido aqui, esconderia o primeiro.
   */
  private registrar(
    request: Request | undefined,
    dados: {
      tipo: ErroTipo;
      status: number;
      mensagem: string;
      stack?: string;
    },
  ) {
    try {
      if (!this.errosLog || !request) return;

      const rota = request.originalUrl ?? request.url ?? '';
      if (rota.includes(ROTA_REPORT)) return;

      // O padrão grava 500 e erros de cliente; 4xx só com o interruptor
      // ligado, para investigação pontual (decisão do usuário — 400 de
      // validação é erro de quem preencheu, não do sistema).
      if (dados.status < 500) {
        if (STATUS_IGNORADOS_4XX.includes(dados.status)) return;
        void this.errosLog
          .lerConfig()
          .then((config) => {
            if (config.registrar4xx) this.gravar(request, rota, dados);
          })
          .catch(() => undefined);
        return;
      }

      this.gravar(request, rota, dados);
    } catch (erro) {
      this.logger.warn(`Falha ao encaminhar erro para o log: ${erro}`);
    }
  }

  private gravar(
    request: Request,
    rota: string,
    dados: { tipo: ErroTipo; status: number; mensagem: string; stack?: string },
  ) {
    const user = (request as Request & { user?: AuthenticatedUser }).user;
    this.errosLog?.registrarDoServidor({
      tipo: dados.tipo,
      rota,
      metodo: request.method,
      status: dados.status,
      mensagem: dados.mensagem,
      stack: dados.stack ?? null,
      usuarioId: user?.id ?? null,
      usuarioEmail: user?.email ?? null,
      empresaId: user?.empresaAtivaId ?? null,
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }
}
