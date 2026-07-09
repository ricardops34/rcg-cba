import { createZodDto } from 'nestjs-zod';
import {
  acompanhamentoQuerySchema,
  metaCreateSchema,
  metaUpdateSchema,
  paginationQuerySchema,
} from '@plataforma/contracts';
import { z } from 'zod';

const metaListQuerySchema = paginationQuerySchema.extend({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

export class MetaCreateDto extends createZodDto(metaCreateSchema) {}
export class MetaUpdateDto extends createZodDto(metaUpdateSchema) {}
export class MetaListQueryDto extends createZodDto(metaListQuerySchema) {}
export class AcompanhamentoQueryDto extends createZodDto(acompanhamentoQuerySchema) {}
