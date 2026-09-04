import { createZodDto } from 'nestjs-zod';
import {
  integracaoClienteCreateSchema,
  integracaoClienteLoteSchema,
  integracaoClienteQuerySchema,
  integracaoClienteUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoClienteCreateDto extends createZodDto(
  integracaoClienteCreateSchema,
) {}
export class IntegracaoClienteUpdateDto extends createZodDto(
  integracaoClienteUpdateSchema,
) {}
export class IntegracaoClienteQueryDto extends createZodDto(
  integracaoClienteQuerySchema,
) {}

export class IntegracaoClienteLoteDto extends createZodDto(
  integracaoClienteLoteSchema,
) {}
