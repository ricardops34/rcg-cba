import { createZodDto } from 'nestjs-zod';
import { comodatoBaixaCriarSchema } from '@plataforma/contracts';

export class ComodatoBaixaCriarDto extends createZodDto(
  comodatoBaixaCriarSchema,
) {}
