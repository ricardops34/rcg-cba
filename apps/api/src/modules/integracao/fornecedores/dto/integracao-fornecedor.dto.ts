import { createZodDto } from 'nestjs-zod';
import {
  integracaoFornecedorCreateSchema,
  integracaoFornecedorLoteSchema,
  integracaoFornecedorQuerySchema,
  integracaoFornecedorUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoFornecedorCreateDto extends createZodDto(
  integracaoFornecedorCreateSchema,
) {}
export class IntegracaoFornecedorUpdateDto extends createZodDto(
  integracaoFornecedorUpdateSchema,
) {}
export class IntegracaoFornecedorQueryDto extends createZodDto(
  integracaoFornecedorQuerySchema,
) {}
export class IntegracaoFornecedorLoteDto extends createZodDto(
  integracaoFornecedorLoteSchema,
) {}
