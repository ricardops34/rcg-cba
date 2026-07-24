import { createZodDto } from 'nestjs-zod';
import { cnaeCreateSchema, cnaeQuerySchema, cnaeUpdateSchema } from '@plataforma/contracts';

export class CnaeCreateDto extends createZodDto(cnaeCreateSchema) {}
export class CnaeUpdateDto extends createZodDto(cnaeUpdateSchema) {}
export class CnaeQueryDto extends createZodDto(cnaeQuerySchema) {}
