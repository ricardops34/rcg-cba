import { createZodDto } from 'nestjs-zod';
import {
  integracaoTabelaPrecoCreateSchema,
  integracaoTabelaPrecoQuerySchema,
  integracaoTabelaPrecoUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoTabelaPrecoCreateDto extends createZodDto(
  integracaoTabelaPrecoCreateSchema,
) {}
export class IntegracaoTabelaPrecoUpdateDto extends createZodDto(
  integracaoTabelaPrecoUpdateSchema,
) {}
export class IntegracaoTabelaPrecoQueryDto extends createZodDto(
  integracaoTabelaPrecoQuerySchema,
) {}
