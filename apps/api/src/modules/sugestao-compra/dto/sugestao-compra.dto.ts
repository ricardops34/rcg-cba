import { createZodDto } from 'nestjs-zod';
import { sugestaoCompraQuerySchema } from '@plataforma/contracts';

export class SugestaoCompraQueryDto extends createZodDto(
  sugestaoCompraQuerySchema,
) {}
