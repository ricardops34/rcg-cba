import { createZodDto } from 'nestjs-zod';
import { paisCreateSchema, paisQuerySchema, paisUpdateSchema } from '@plataforma/contracts';

export class PaisCreateDto extends createZodDto(paisCreateSchema) {}
export class PaisUpdateDto extends createZodDto(paisUpdateSchema) {}
export class PaisQueryDto extends createZodDto(paisQuerySchema) {}
