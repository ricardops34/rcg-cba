import { createZodDto } from 'nestjs-zod';
import {
  integracaoNotaSaidaCreateSchema,
  integracaoNotaSaidaQuerySchema,
  integracaoNotaSaidaUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoNotaSaidaCreateDto extends createZodDto(
  integracaoNotaSaidaCreateSchema,
) {}
export class IntegracaoNotaSaidaUpdateDto extends createZodDto(
  integracaoNotaSaidaUpdateSchema,
) {}
export class IntegracaoNotaSaidaQueryDto extends createZodDto(
  integracaoNotaSaidaQuerySchema,
) {}
