import { createZodDto } from 'nestjs-zod';
import {
  paginationQuerySchema,
  tituloReceberCreateSchema,
  tituloReceberUpdateSchema,
} from '@plataforma/contracts';
import { z } from 'zod';

// z.coerce.boolean() faria Boolean("false") === true; query string precisa de
// comparação explícita com o literal.
const boolParam = z.preprocess(
  (v) => (v === undefined ? undefined : v === 'true' || v === true),
  z.boolean().optional(),
);

const tituloListQuerySchema = paginationQuerySchema.extend({
  clienteId: z.string().uuid().optional(),
  // aberto=true: apenas títulos com saldo > 0; vencido=true: além disso, já vencidos.
  aberto: boolParam,
  vencido: boolParam,
});

export class TituloReceberCreateDto extends createZodDto(tituloReceberCreateSchema) {}
export class TituloReceberUpdateDto extends createZodDto(tituloReceberUpdateSchema) {}
export class TituloReceberListQueryDto extends createZodDto(tituloListQuerySchema) {}
