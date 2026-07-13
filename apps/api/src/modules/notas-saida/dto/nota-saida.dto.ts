import { createZodDto } from 'nestjs-zod';
import {
  notaSaidaCreateSchema,
  notaSaidaUpdateSchema,
  paginationQuerySchema,
} from '@plataforma/contracts';
import { z } from 'zod';

// z.coerce.boolean() faria Boolean("false") === true; query string precisa de
// comparação explícita com o literal.
const boolParam = z.preprocess(
  (v) => (v === undefined ? undefined : v === 'true' || v === true),
  z.boolean().optional(),
);

const notaSaidaListQuerySchema = paginationQuerySchema.extend({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  clienteId: z.string().uuid().optional(),
  comodato: boolParam,
});

export class NotaSaidaCreateDto extends createZodDto(notaSaidaCreateSchema) {}
export class NotaSaidaUpdateDto extends createZodDto(notaSaidaUpdateSchema) {}
export class NotaSaidaListQueryDto extends createZodDto(notaSaidaListQuerySchema) {}
