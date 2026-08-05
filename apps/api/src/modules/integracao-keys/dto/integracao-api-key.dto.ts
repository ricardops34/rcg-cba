import { createZodDto } from 'nestjs-zod';
import {
  integracaoApiKeyCreateSchema,
  integracaoApiKeyQuerySchema,
  integracaoApiKeyUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoApiKeyCreateDto extends createZodDto(
  integracaoApiKeyCreateSchema,
) {}
export class IntegracaoApiKeyUpdateDto extends createZodDto(
  integracaoApiKeyUpdateSchema,
) {}
export class IntegracaoApiKeyQueryDto extends createZodDto(
  integracaoApiKeyQuerySchema,
) {}
