import { createZodDto } from 'nestjs-zod';
import { estadoCreateSchema, estadoQuerySchema, estadoUpdateSchema } from '@plataforma/contracts';

export class EstadoCreateDto extends createZodDto(estadoCreateSchema) {}
export class EstadoUpdateDto extends createZodDto(estadoUpdateSchema) {}
export class EstadoQueryDto extends createZodDto(estadoQuerySchema) {}
