import { createZodDto } from 'nestjs-zod';
import { empresaCreateSchema, empresaQuerySchema, empresaUpdateSchema } from '@plataforma/contracts';

export class EmpresaCreateDto extends createZodDto(empresaCreateSchema) {}
export class EmpresaUpdateDto extends createZodDto(empresaUpdateSchema) {}
export class EmpresaQueryDto extends createZodDto(empresaQuerySchema) {}
