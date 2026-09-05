import { createZodDto } from 'nestjs-zod';
import {
  agenteConfigUpdateSchema,
  agenteEnvioSchema,
  agenteFerramentaUpdateSchema,
  agenteOauthConcluirSchema,
  agenteOauthImportarSchema,
  agenteTestarConexaoSchema,
  agentePromptPreviaSchema,
  agentePromptTesteSchema,
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
export class AgenteFerramentaUpdateDto extends createZodDto(
  agenteFerramentaUpdateSchema,
) {}

export class AgentePromptPreviaDto extends createZodDto(
  agentePromptPreviaSchema,
) {}
export class AgentePromptTesteDto extends createZodDto(
  agentePromptTesteSchema,
) {}
