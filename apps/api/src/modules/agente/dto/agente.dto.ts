import { createZodDto } from 'nestjs-zod';
import {
  agenteConfigUpdateSchema,
  agenteEnvioSchema,
  agenteTestarConexaoSchema,
} from '@plataforma/contracts';

export class AgenteConfigUpdateDto extends createZodDto(
  agenteConfigUpdateSchema,
) {}
export class AgenteEnvioDto extends createZodDto(agenteEnvioSchema) {}
export class AgenteTestarConexaoDto extends createZodDto(
  agenteTestarConexaoSchema,
) {}
