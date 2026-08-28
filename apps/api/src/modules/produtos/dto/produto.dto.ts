import { createZodDto } from 'nestjs-zod';
import {
  produtoCreateSchema,
  produtoFotoVincularSchema,
  produtoQuerySchema,
  produtoUpdateSchema,
} from '@plataforma/contracts';

export class ProdutoCreateDto extends createZodDto(produtoCreateSchema) {}
export class ProdutoUpdateDto extends createZodDto(produtoUpdateSchema) {}
export class ProdutoQueryDto extends createZodDto(produtoQuerySchema) {}
export class ProdutoFotoVincularDto extends createZodDto(
  produtoFotoVincularSchema,
) {}
