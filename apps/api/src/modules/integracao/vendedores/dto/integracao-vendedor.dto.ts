import { createZodDto } from 'nestjs-zod';
import {
  integracaoVendedorCreateSchema,
  integracaoVendedorLoteSchema,
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

export class IntegracaoVendedorLoteDto extends createZodDto(
  integracaoVendedorLoteSchema,
) {}
