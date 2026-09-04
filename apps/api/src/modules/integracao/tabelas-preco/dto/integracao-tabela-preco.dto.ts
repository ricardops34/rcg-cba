import { createZodDto } from 'nestjs-zod';
import {
  integracaoTabelaPrecoCreateSchema,
  integracaoTabelaPrecoLoteSchema,
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

export class IntegracaoTabelaPrecoLoteDto extends createZodDto(
  integracaoTabelaPrecoLoteSchema,
) {}
