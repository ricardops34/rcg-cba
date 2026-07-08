import { applyDecorators } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';

/**
 * Documenta o corpo da requisição com um exemplo de uso, sem precisar
 * declarar o schema completo manualmente (o schema real vem do ZodDto).
 */
export function ApiBodyExample(example: unknown) {
  return applyDecorators(
    ApiBody({
      schema: { type: 'object' },
      examples: { padrao: { value: example as Record<string, unknown> } },
    }),
  );
}
