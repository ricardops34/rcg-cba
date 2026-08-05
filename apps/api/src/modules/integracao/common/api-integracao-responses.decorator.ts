import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/**
 * Respostas comuns a toda rota da API de integração (guard/throttle) — usar
 * uma vez, a nível de controller, em vez de repetir em cada método.
 */
export function ApiIntegracaoAuthResponses() {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Chave de API ausente, inválida, expirada ou revogada',
    }),
    ApiResponse({ status: 429, description: 'Limite de requisições excedido' }),
  );
}
