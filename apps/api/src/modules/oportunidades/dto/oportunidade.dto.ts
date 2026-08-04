import { createZodDto } from 'nestjs-zod';
import {
  oportunidadeCreateSchema,
  oportunidadeQuerySchema,
  oportunidadeUpdateSchema,
} from '@plataforma/contracts';

export class OportunidadeCreateDto extends createZodDto(oportunidadeCreateSchema) {}
export class OportunidadeUpdateDto extends createZodDto(oportunidadeUpdateSchema) {}
export class OportunidadeQueryDto extends createZodDto(oportunidadeQuerySchema) {}
