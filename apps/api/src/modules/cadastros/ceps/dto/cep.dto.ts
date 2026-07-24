import { createZodDto } from 'nestjs-zod';
import { cepCreateSchema, cepQuerySchema, cepUpdateSchema } from '@plataforma/contracts';

export class CepCreateDto extends createZodDto(cepCreateSchema) {}
export class CepUpdateDto extends createZodDto(cepUpdateSchema) {}
export class CepQueryDto extends createZodDto(cepQuerySchema) {}
