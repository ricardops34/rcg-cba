import { createZodDto } from 'nestjs-zod';
import { prospeccaoColetaCriarSchema } from '@plataforma/contracts';

export class ProspeccaoColetaCriarDto extends createZodDto(
  prospeccaoColetaCriarSchema,
) {}
