import { createZodDto } from 'nestjs-zod';
import {
  agenteConfigUpdateSchema,
  agenteEnvioSchema,
  agenteOauthConcluirSchema,
  agenteOauthImportarSchema,
  agenteTestarConexaoSchema,
} from '@plataforma/contracts';

export class AgenteConfigUpdateDto extends createZodDto(
  agenteConfigUpdateSchema,
) {}
export class AgenteEnvioDto extends createZodDto(agenteEnvioSchema) {}
export class AgenteTestarConexaoDto extends createZodDto(
  agenteTestarConexaoSchema,
) {}
export class AgenteOauthConcluirDto extends createZodDto(
  agenteOauthConcluirSchema,
) {}
export class AgenteOauthImportarDto extends createZodDto(
  agenteOauthImportarSchema,
) {}
