import { createZodDto } from 'nestjs-zod';
import {
  integracaoProdutoCreateSchema,
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
