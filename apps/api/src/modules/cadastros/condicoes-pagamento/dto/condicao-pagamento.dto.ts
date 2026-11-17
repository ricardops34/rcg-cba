import { createZodDto } from 'nestjs-zod';
import {
  condicaoPagamentoQuerySchema,
  condicaoPagamentoUpdateSchema,
} from '@plataforma/contracts';

export class CondicaoPagamentoQueryDto extends createZodDto(
  condicaoPagamentoQuerySchema,
) {}
export class CondicaoPagamentoUpdateDto extends createZodDto(
  condicaoPagamentoUpdateSchema,
) {}
