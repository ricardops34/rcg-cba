import { createZodDto } from 'nestjs-zod';
import { armazemCreateSchema, armazemQuerySchema, armazemUpdateSchema } from '@plataforma/contracts';

export class ArmazemCreateDto extends createZodDto(armazemCreateSchema) {}
export class ArmazemUpdateDto extends createZodDto(armazemUpdateSchema) {}
export class ArmazemQueryDto extends createZodDto(armazemQuerySchema) {}
