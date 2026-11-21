import { createZodDto } from 'nestjs-zod';
import {
  receitaBaseCargaSchema,
  receitaBaseConfigSalvarSchema,
} from '@plataforma/contracts';

export class ReceitaBaseConfigSalvarDto extends createZodDto(
  receitaBaseConfigSalvarSchema,
) {}
export class ReceitaBaseCargaDto extends createZodDto(receitaBaseCargaSchema) {}
