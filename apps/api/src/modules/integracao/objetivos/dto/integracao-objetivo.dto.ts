import { createZodDto } from 'nestjs-zod';
import {
  integracaoObjetivoCreateSchema,
  integracaoObjetivoLoteSchema,
  integracaoObjetivoQuerySchema,
  integracaoObjetivoUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoObjetivoCreateDto extends createZodDto(
  integracaoObjetivoCreateSchema,
) {}
export class IntegracaoObjetivoUpdateDto extends createZodDto(
  integracaoObjetivoUpdateSchema,
) {}
export class IntegracaoObjetivoQueryDto extends createZodDto(
  integracaoObjetivoQuerySchema,
) {}

export class IntegracaoObjetivoLoteDto extends createZodDto(
  integracaoObjetivoLoteSchema,
) {}
