import { createZodDto } from 'nestjs-zod';
import {
  integracaoEstoqueCreateSchema,
  integracaoEstoqueQuerySchema,
  integracaoEstoqueUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoEstoqueCreateDto extends createZodDto(
  integracaoEstoqueCreateSchema,
) {}
export class IntegracaoEstoqueUpdateDto extends createZodDto(
  integracaoEstoqueUpdateSchema,
) {}
export class IntegracaoEstoqueQueryDto extends createZodDto(
  integracaoEstoqueQuerySchema,
) {}
