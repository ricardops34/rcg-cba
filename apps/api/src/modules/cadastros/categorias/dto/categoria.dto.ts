import { createZodDto } from 'nestjs-zod';
import { categoriaQuerySchema } from '@plataforma/contracts';

export class CategoriaQueryDto extends createZodDto(categoriaQuerySchema) {}
