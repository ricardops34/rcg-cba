import { createZodDto } from 'nestjs-zod';
import {
  regraDescontoCreateSchema,
  regraDescontoQuerySchema,
  regraDescontoUpdateSchema,
} from '@plataforma/contracts';

export class RegraDescontoCreateDto extends createZodDto(
  regraDescontoCreateSchema,
) {}
export class RegraDescontoUpdateDto extends createZodDto(
  regraDescontoUpdateSchema,
) {}
export class RegraDescontoQueryDto extends createZodDto(
  regraDescontoQuerySchema,
) {}
