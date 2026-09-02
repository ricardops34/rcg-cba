import { createZodDto } from 'nestjs-zod';
import { meusAtendimentosQuerySchema } from '@plataforma/contracts';

export class MeusAtendimentosQueryDto extends createZodDto(
  meusAtendimentosQuerySchema,
) {}
