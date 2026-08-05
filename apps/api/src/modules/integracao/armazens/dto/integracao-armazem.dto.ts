import { createZodDto } from 'nestjs-zod';
import {
  integracaoArmazemCreateSchema,
  integracaoArmazemQuerySchema,
  integracaoArmazemUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoArmazemCreateDto extends createZodDto(
  integracaoArmazemCreateSchema,
) {}
export class IntegracaoArmazemUpdateDto extends createZodDto(
  integracaoArmazemUpdateSchema,
) {}
export class IntegracaoArmazemQueryDto extends createZodDto(
  integracaoArmazemQuerySchema,
) {}
