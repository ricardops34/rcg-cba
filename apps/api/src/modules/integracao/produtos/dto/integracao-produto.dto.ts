import { createZodDto } from 'nestjs-zod';
import {
  integracaoProdutoCreateSchema,
  integracaoProdutoLoteSchema,
  integracaoProdutoQuerySchema,
  integracaoProdutoUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoProdutoCreateDto extends createZodDto(
  integracaoProdutoCreateSchema,
) {}
export class IntegracaoProdutoUpdateDto extends createZodDto(
  integracaoProdutoUpdateSchema,
) {}
export class IntegracaoProdutoQueryDto extends createZodDto(
  integracaoProdutoQuerySchema,
) {}

export class IntegracaoProdutoLoteDto extends createZodDto(
  integracaoProdutoLoteSchema,
) {}
