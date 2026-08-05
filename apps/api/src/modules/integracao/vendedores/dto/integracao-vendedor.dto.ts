import { createZodDto } from 'nestjs-zod';
import {
  integracaoVendedorCreateSchema,
  integracaoVendedorQuerySchema,
  integracaoVendedorUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoVendedorCreateDto extends createZodDto(
  integracaoVendedorCreateSchema,
) {}
export class IntegracaoVendedorUpdateDto extends createZodDto(
  integracaoVendedorUpdateSchema,
) {}
export class IntegracaoVendedorQueryDto extends createZodDto(
  integracaoVendedorQuerySchema,
) {}
