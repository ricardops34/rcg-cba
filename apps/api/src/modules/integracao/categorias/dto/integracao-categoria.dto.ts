import { createZodDto } from 'nestjs-zod';
import {
  integracaoCategoriaCreateSchema,
  integracaoCategoriaLoteSchema,
  integracaoCategoriaQuerySchema,
  integracaoCategoriaUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoCategoriaCreateDto extends createZodDto(
  integracaoCategoriaCreateSchema,
) {}
export class IntegracaoCategoriaUpdateDto extends createZodDto(
  integracaoCategoriaUpdateSchema,
) {}
export class IntegracaoCategoriaQueryDto extends createZodDto(
  integracaoCategoriaQuerySchema,
) {}
export class IntegracaoCategoriaLoteDto extends createZodDto(
  integracaoCategoriaLoteSchema,
) {}
