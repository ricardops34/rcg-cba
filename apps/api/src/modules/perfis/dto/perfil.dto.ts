import { createZodDto } from 'nestjs-zod';
import {
  perfilCopiarSchema,
  perfilCreateSchema,
  perfilPermissoesUpdateSchema,
  perfilQuerySchema,
  perfilUpdateSchema,
} from '@plataforma/contracts';

export class PerfilCreateDto extends createZodDto(perfilCreateSchema) {}
export class PerfilCopiarDto extends createZodDto(perfilCopiarSchema) {}
export class PerfilUpdateDto extends createZodDto(perfilUpdateSchema) {}
export class PerfilQueryDto extends createZodDto(perfilQuerySchema) {}
export class PerfilPermissoesUpdateDto extends createZodDto(
  perfilPermissoesUpdateSchema,
) {}
