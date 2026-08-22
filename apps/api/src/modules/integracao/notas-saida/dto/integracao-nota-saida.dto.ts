import { createZodDto } from 'nestjs-zod';
import {
  integracaoNfeXmlSchema,
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

/** XML autorizado da NF-e — insumo da 2ª via do DANFE. */
export class IntegracaoNfeXmlDto extends createZodDto(integracaoNfeXmlSchema) {}
