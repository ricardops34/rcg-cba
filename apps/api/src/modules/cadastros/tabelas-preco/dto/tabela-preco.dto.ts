import { createZodDto } from 'nestjs-zod';
import {
  tabelaPrecoItemQuerySchema,
  tabelaPrecoQuerySchema,
} from '@plataforma/contracts';

export class TabelaPrecoQueryDto extends createZodDto(tabelaPrecoQuerySchema) {}
export class TabelaPrecoItemQueryDto extends createZodDto(
  tabelaPrecoItemQuerySchema,
) {}
