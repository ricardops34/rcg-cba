import { createZodDto } from 'nestjs-zod';
import {
  integracaoCondicaoPagamentoCreateSchema,
  integracaoCondicaoPagamentoLoteSchema,
  integracaoCondicaoPagamentoQuerySchema,
  integracaoCondicaoPagamentoUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoCondicaoPagamentoCreateDto extends createZodDto(
  integracaoCondicaoPagamentoCreateSchema,
) {}
export class IntegracaoCondicaoPagamentoUpdateDto extends createZodDto(
  integracaoCondicaoPagamentoUpdateSchema,
) {}
export class IntegracaoCondicaoPagamentoQueryDto extends createZodDto(
  integracaoCondicaoPagamentoQuerySchema,
) {}

export class IntegracaoCondicaoPagamentoLoteDto extends createZodDto(
  integracaoCondicaoPagamentoLoteSchema,
) {}
