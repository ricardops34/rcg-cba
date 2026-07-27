import { createZodDto } from 'nestjs-zod';
import { notaSaidaQuerySchema } from '@plataforma/contracts';

export class NotaSaidaQueryDto extends createZodDto(notaSaidaQuerySchema) {}
