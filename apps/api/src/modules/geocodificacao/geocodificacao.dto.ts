import { createZodDto } from 'nestjs-zod';
import {
  coordenadasSchema,
  geocodificacaoBuscarSchema,
  geocodificacaoRotaSchema,
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
export class GeocodificacaoBuscarDto extends createZodDto(
  geocodificacaoBuscarSchema,
) {}
export class CoordenadasDto extends createZodDto(coordenadasSchema) {}
export class GeocodificacaoRotaDto extends createZodDto(
  geocodificacaoRotaSchema,
) {}
export class GeocodificacaoLoteDto extends createZodDto(
  geocodificacaoLoteSchema,
) {}
