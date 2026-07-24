import { createZodDto } from 'nestjs-zod';
import { notaSaidaItemQuerySchema, notaSaidaQuerySchema } from '@plataforma/contracts';

export class NotaSaidaQueryDto extends createZodDto(notaSaidaQuerySchema) {}
export class NotaSaidaItemQueryDto extends createZodDto(notaSaidaItemQuerySchema) {}
