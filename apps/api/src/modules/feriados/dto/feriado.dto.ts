import { createZodDto } from 'nestjs-zod';
import {
  feriadoCreateSchema,
  feriadoGerarNacionaisSchema,
  feriadoQuerySchema,
  feriadoUpdateSchema,
} from '@plataforma/contracts';

export class FeriadoCreateDto extends createZodDto(feriadoCreateSchema) {}
export class FeriadoUpdateDto extends createZodDto(feriadoUpdateSchema) {}
export class FeriadoQueryDto extends createZodDto(feriadoQuerySchema) {}
export class FeriadoGerarNacionaisDto extends createZodDto(feriadoGerarNacionaisSchema) {}
