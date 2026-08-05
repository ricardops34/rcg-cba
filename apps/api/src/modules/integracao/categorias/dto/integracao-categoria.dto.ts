import { createZodDto } from 'nestjs-zod';
import {
  integracaoCategoriaCreateSchema,
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
