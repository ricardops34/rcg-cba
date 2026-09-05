import { createZodDto } from 'nestjs-zod';
import {
  produtoCreateSchema,
  produtoFotoVincularSchema,
  produtoQuerySchema,
  produtoFichaAtualizarSchema,
  produtoRelacionadoCriarSchema,
  produtoUpdateSchema,
} from '@plataforma/contracts';

export class ProdutoCreateDto extends createZodDto(produtoCreateSchema) {}
export class ProdutoUpdateDto extends createZodDto(produtoUpdateSchema) {}
export class ProdutoQueryDto extends createZodDto(produtoQuerySchema) {}
export class ProdutoFotoVincularDto extends createZodDto(
  produtoFotoVincularSchema,
) {}
export class ProdutoRelacionadoCriarDto extends createZodDto(
  produtoRelacionadoCriarSchema,
) {}
export class ProdutoFichaAtualizarDto extends createZodDto(
  produtoFichaAtualizarSchema,
) {}
