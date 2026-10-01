import { createZodDto } from 'nestjs-zod';
import { emailConfiguracaoUpdateSchema } from '@plataforma/contracts';

export class EmailConfiguracaoUpdateDto extends createZodDto(
  emailConfiguracaoUpdateSchema,
) {}
