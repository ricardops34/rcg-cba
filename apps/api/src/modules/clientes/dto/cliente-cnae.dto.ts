import { createZodDto } from 'nestjs-zod';
import { clienteCnaeCreateSchema } from '@plataforma/contracts';

export class ClienteCnaeCreateDto extends createZodDto(
  clienteCnaeCreateSchema,
) {}
