import { createZodDto } from 'nestjs-zod';
import {
  integracaoOrcamentoCreateSchema,
  integracaoOrcamentoQuerySchema,
  integracaoOrcamentoUpdateSchema,
} from '@plataforma/contracts';

export class IntegracaoOrcamentoCreateDto extends createZodDto(
  integracaoOrcamentoCreateSchema,
) {}
export class IntegracaoOrcamentoUpdateDto extends createZodDto(
  integracaoOrcamentoUpdateSchema,
) {}
export class IntegracaoOrcamentoQueryDto extends createZodDto(
  integracaoOrcamentoQuerySchema,
) {}
