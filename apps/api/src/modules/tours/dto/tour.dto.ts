import { createZodDto } from 'nestjs-zod';
import {
  atualizarTourInputSchema,
  iniciarTourInputSchema,
  tourCodigoSchema,
} from '@plataforma/contracts';
import { z } from 'zod';

export class IniciarTourDto extends createZodDto(iniciarTourInputSchema) {}
export class AtualizarTourDto extends createZodDto(atualizarTourInputSchema) {}
export class TourCodigoDto extends createZodDto(
  z.object({ codigo: tourCodigoSchema }),
) {}
export class TourEstadoQueryDto extends createZodDto(
  z.object({ versao: z.coerce.number().int().positive() }),
) {}
