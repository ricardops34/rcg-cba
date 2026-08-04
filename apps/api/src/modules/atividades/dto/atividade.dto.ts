import { createZodDto } from 'nestjs-zod';
import {
  atividadeCreateSchema,
  atividadeQuerySchema,
  atividadeUpdateSchema,
} from '@plataforma/contracts';

export class AtividadeCreateDto extends createZodDto(atividadeCreateSchema) {}
export class AtividadeUpdateDto extends createZodDto(atividadeUpdateSchema) {}
export class AtividadeQueryDto extends createZodDto(atividadeQuerySchema) {}
