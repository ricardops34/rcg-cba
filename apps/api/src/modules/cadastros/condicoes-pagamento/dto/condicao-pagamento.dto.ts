import { createZodDto } from 'nestjs-zod';
import {
  condicaoPagamentoCreateSchema,
  condicaoPagamentoQuerySchema,
  condicaoPagamentoUpdateSchema,
} from '@plataforma/contracts';

export class CondicaoPagamentoCreateDto extends createZodDto(condicaoPagamentoCreateSchema) {}
export class CondicaoPagamentoUpdateDto extends createZodDto(condicaoPagamentoUpdateSchema) {}
export class CondicaoPagamentoQueryDto extends createZodDto(condicaoPagamentoQuerySchema) {}
