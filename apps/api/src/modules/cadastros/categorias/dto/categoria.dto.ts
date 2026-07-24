import { createZodDto } from 'nestjs-zod';
import { categoriaCreateSchema, categoriaQuerySchema, categoriaUpdateSchema } from '@plataforma/contracts';

export class CategoriaCreateDto extends createZodDto(categoriaCreateSchema) {}
export class CategoriaUpdateDto extends createZodDto(categoriaUpdateSchema) {}
export class CategoriaQueryDto extends createZodDto(categoriaQuerySchema) {}
