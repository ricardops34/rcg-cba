import { createZodDto } from 'nestjs-zod';
import { condicaoPagamentoQuerySchema } from '@plataforma/contracts';

export class CondicaoPagamentoQueryDto extends createZodDto(
  condicaoPagamentoQuerySchema,
) {}
