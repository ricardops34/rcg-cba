import { createZodDto } from 'nestjs-zod';
import {
  categoriaQuerySchema,
  categoriaUpdateSchema,
} from '@plataforma/contracts';

export class CategoriaQueryDto extends createZodDto(categoriaQuerySchema) {}
export class CategoriaUpdateDto extends createZodDto(categoriaUpdateSchema) {}
