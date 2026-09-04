import { createZodDto } from 'nestjs-zod';
import {
  integracaoRegraDescontoCreateSchema,
  integracaoRegraDescontoLoteSchema,
  integracaoRegraDescontoQuerySchema,
  integracaoRegraDescontoUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoRegraDescontoCreateDto extends createZodDto(
  integracaoRegraDescontoCreateSchema,
) {}
export class IntegracaoRegraDescontoUpdateDto extends createZodDto(
  integracaoRegraDescontoUpdateSchema,
) {}
export class IntegracaoRegraDescontoQueryDto extends createZodDto(
  integracaoRegraDescontoQuerySchema,
) {}

export class IntegracaoRegraDescontoLoteDto extends createZodDto(
  integracaoRegraDescontoLoteSchema,
) {}
