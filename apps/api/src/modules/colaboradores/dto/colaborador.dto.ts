import { createZodDto } from 'nestjs-zod';
import {
  colaboradorCreateSchema,
  colaboradorUpdateSchema,
} from '@plataforma/contracts';

export class ColaboradorCreateDto extends createZodDto(colaboradorCreateSchema) {}
export class ColaboradorUpdateDto extends createZodDto(colaboradorUpdateSchema) {}
