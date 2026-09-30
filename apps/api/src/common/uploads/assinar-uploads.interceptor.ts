import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import { assinarNaResposta } from './link-assinado';

/**
 * Assina os caminhos de mídia do WhatsApp nas respostas da API — ver
 * `link-assinado.ts`. Global: mensagem, foto de contato e anexo aparecem em
 * mais de um módulo (atendimento, posição de cliente, meus atendimentos).
 */
@Injectable()
export class AssinarUploadsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((dados) => assinarNaResposta(dados)));
  }
}
