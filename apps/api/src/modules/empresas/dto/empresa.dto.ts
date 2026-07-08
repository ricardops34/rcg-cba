import { createZodDto } from 'nestjs-zod';
import { empresaCreateSchema, empresaUpdateSchema } from '@plataforma/contracts';

export class EmpresaCreateDto extends createZodDto(empresaCreateSchema) {}
export class EmpresaUpdateDto extends createZodDto(empresaUpdateSchema) {}
