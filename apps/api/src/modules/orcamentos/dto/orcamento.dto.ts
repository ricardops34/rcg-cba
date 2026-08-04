import { createZodDto } from 'nestjs-zod';
import {
  orcamentoCreateSchema,
  orcamentoQuerySchema,
  orcamentoUpdateSchema,
} from '@plataforma/contracts';

export class OrcamentoCreateDto extends createZodDto(orcamentoCreateSchema) {}
export class OrcamentoUpdateDto extends createZodDto(orcamentoUpdateSchema) {}
export class OrcamentoQueryDto extends createZodDto(orcamentoQuerySchema) {}
