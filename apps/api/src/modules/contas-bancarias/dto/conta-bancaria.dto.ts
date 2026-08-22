import { createZodDto } from 'nestjs-zod';
import {
  contaBancariaCreateSchema,
  contaBancariaQuerySchema,
  contaBancariaUpdateSchema,
} from '@plataforma/contracts';

export class ContaBancariaCreateDto extends createZodDto(contaBancariaCreateSchema) {}
export class ContaBancariaUpdateDto extends createZodDto(contaBancariaUpdateSchema) {}
export class ContaBancariaQueryDto extends createZodDto(contaBancariaQuerySchema) {}
