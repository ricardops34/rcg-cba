import { createZodDto } from 'nestjs-zod';
import {
  parametroEmpresaCreateSchema,
  parametroEmpresaQuerySchema,
  parametroEmpresaUpdateSchema,
} from '@plataforma/contracts';

export class ParametroCreateDto extends createZodDto(
  parametroEmpresaCreateSchema,
) {}
export class ParametroUpdateDto extends createZodDto(
  parametroEmpresaUpdateSchema,
) {}
export class ParametroQueryDto extends createZodDto(
  parametroEmpresaQuerySchema,
) {}
