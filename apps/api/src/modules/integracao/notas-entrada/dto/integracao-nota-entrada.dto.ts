import { createZodDto } from 'nestjs-zod';
import {
  integracaoNotaEntradaCreateSchema,
  integracaoNotaEntradaLoteSchema,
  integracaoNotaEntradaQuerySchema,
  integracaoNotaEntradaUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoNotaEntradaCreateDto extends createZodDto(
  integracaoNotaEntradaCreateSchema,
) {}
export class IntegracaoNotaEntradaUpdateDto extends createZodDto(
  integracaoNotaEntradaUpdateSchema,
) {}
export class IntegracaoNotaEntradaQueryDto extends createZodDto(
  integracaoNotaEntradaQuerySchema,
) {}
export class IntegracaoNotaEntradaLoteDto extends createZodDto(
  integracaoNotaEntradaLoteSchema,
) {}
