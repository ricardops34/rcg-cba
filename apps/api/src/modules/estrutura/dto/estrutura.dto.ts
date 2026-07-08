import { createZodDto } from 'nestjs-zod';
import {
  menuCreateSchema,
  menuUpdateSchema,
  moduloCreateSchema,
  moduloUpdateSchema,
  rotinaCreateSchema,
  rotinaUpdateSchema,
} from '@plataforma/contracts';

export class ModuloCreateDto extends createZodDto(moduloCreateSchema) {}
export class ModuloUpdateDto extends createZodDto(moduloUpdateSchema) {}
export class MenuCreateDto extends createZodDto(menuCreateSchema) {}
export class MenuUpdateDto extends createZodDto(menuUpdateSchema) {}
export class RotinaCreateDto extends createZodDto(rotinaCreateSchema) {}
export class RotinaUpdateDto extends createZodDto(rotinaUpdateSchema) {}
