import { createZodDto } from 'nestjs-zod';
import {
  politicaSenhaSchema,
  politicaSenhaUpdateSchema,
} from '@plataforma/contracts';

export class PoliticaSenhaDto extends createZodDto(politicaSenhaSchema) {}
export class PoliticaSenhaUpdateDto extends createZodDto(
  politicaSenhaUpdateSchema,
) {}
