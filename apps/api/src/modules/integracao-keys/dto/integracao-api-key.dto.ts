import { createZodDto } from 'nestjs-zod';
import {
  integracaoEndpointToggleSchema,
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
export class IntegracaoEndpointToggleDto extends createZodDto(
  integracaoEndpointToggleSchema,
) {}
export class IntegracaoApiKeyQueryDto extends createZodDto(
  integracaoApiKeyQuerySchema,
) {}
