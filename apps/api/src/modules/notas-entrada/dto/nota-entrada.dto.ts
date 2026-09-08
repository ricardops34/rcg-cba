import { createZodDto } from 'nestjs-zod';
import { notaEntradaQuerySchema } from '@plataforma/contracts';

export class NotaEntradaQueryDto extends createZodDto(notaEntradaQuerySchema) {}
