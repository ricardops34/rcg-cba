import { createZodDto } from 'nestjs-zod';
import {
  integracaoTituloReceberCreateSchema,
  integracaoTituloReceberLoteSchema,
  integracaoTituloReceberQuerySchema,
  integracaoTituloReceberUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoTituloReceberCreateDto extends createZodDto(
  integracaoTituloReceberCreateSchema,
) {}
export class IntegracaoTituloReceberUpdateDto extends createZodDto(
  integracaoTituloReceberUpdateSchema,
) {}
export class IntegracaoTituloReceberQueryDto extends createZodDto(
  integracaoTituloReceberQuerySchema,
) {}

export class IntegracaoTituloReceberLoteDto extends createZodDto(
  integracaoTituloReceberLoteSchema,
) {}
