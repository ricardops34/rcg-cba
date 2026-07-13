import { createZodDto } from 'nestjs-zod';
import { produtoCreateSchema, produtoUpdateSchema } from '@plataforma/contracts';

export class ProdutoCreateDto extends createZodDto(produtoCreateSchema) {}
export class ProdutoUpdateDto extends createZodDto(produtoUpdateSchema) {}
