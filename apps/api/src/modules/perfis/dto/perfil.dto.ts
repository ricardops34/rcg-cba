import { createZodDto } from 'nestjs-zod';
import {
  perfilCreateSchema,
  perfilPermissoesUpdateSchema,
  perfilUpdateSchema,
} from '@plataforma/contracts';

export class PerfilCreateDto extends createZodDto(perfilCreateSchema) {}
export class PerfilUpdateDto extends createZodDto(perfilUpdateSchema) {}
export class PerfilPermissoesUpdateDto extends createZodDto(
  perfilPermissoesUpdateSchema,
) {}
