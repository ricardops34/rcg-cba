import { createZodDto } from 'nestjs-zod';
import {
  comunicadoCreateSchema,
  comunicadoQuerySchema,
  comunicadoUpdateSchema,
} from '@plataforma/contracts';

export class ComunicadoCreateDto extends createZodDto(comunicadoCreateSchema) {}
export class ComunicadoUpdateDto extends createZodDto(comunicadoUpdateSchema) {}
export class ComunicadoQueryDto extends createZodDto(comunicadoQuerySchema) {}
