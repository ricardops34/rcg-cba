import { createZodDto } from 'nestjs-zod';
import {
  geocodificacaoConfiguracaoUpdateSchema,
  geocodificacaoLoteSchema,
  geocodificacaoTesteSchema,
} from '@plataforma/contracts';

export class GeocodificacaoConfiguracaoUpdateDto extends createZodDto(
  geocodificacaoConfiguracaoUpdateSchema,
) {}
export class GeocodificacaoTesteDto extends createZodDto(
  geocodificacaoTesteSchema,
) {}
export class GeocodificacaoLoteDto extends createZodDto(
  geocodificacaoLoteSchema,
) {}
