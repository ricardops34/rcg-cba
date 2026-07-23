import { createZodDto } from 'nestjs-zod';
import {
  perfilCreateSchema,
  perfilPermissoesUpdateSchema,
  perfilQuerySchema,
  perfilUpdateSchema,
} from '@plataforma/contracts';

export class PerfilCreateDto extends createZodDto(perfilCreateSchema) {}
export class PerfilUpdateDto extends createZodDto(perfilUpdateSchema) {}
export class PerfilQueryDto extends createZodDto(perfilQuerySchema) {}
export class PerfilPermissoesUpdateDto extends createZodDto(
  perfilPermissoesUpdateSchema,
) {}
