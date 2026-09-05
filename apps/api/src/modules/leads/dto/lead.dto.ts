import { createZodDto } from 'nestjs-zod';
import { leadAtualizarSchema, leadQuerySchema } from '@plataforma/contracts';

export class LeadQueryDto extends createZodDto(leadQuerySchema) {}
export class LeadAtualizarDto extends createZodDto(leadAtualizarSchema) {}
