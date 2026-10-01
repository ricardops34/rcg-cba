import { createZodDto } from 'nestjs-zod';
import {
  emailConfiguracaoUpdateSchema,
  emailModelosUpdateSchema,
  emailModeloRestaurarSchema,
  emailModeloTesteSchema,
} from '@plataforma/contracts';

export class EmailConfiguracaoUpdateDto extends createZodDto(
  emailConfiguracaoUpdateSchema,
) {}

export class EmailModelosUpdateDto extends createZodDto(
  emailModelosUpdateSchema,
) {}

export class EmailModeloRestaurarDto extends createZodDto(
  emailModeloRestaurarSchema,
) {}

export class EmailModeloTesteDto extends createZodDto(
  emailModeloTesteSchema,
) {}

