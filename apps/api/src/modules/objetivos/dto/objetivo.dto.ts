import { createZodDto } from 'nestjs-zod';
import {
  dashboardGerencialQuerySchema,
  dashboardGerencialVendedorQuerySchema,
  objetivoCopiarPeriodoSchema,
  objetivoDashboardMunicipiosQuerySchema,
  objetivoDashboardQuerySchema,
  objetivoVendedorMesCreateSchema,
  objetivoVendedorMesQuerySchema,
  objetivoVendedorMesUpdateSchema,
} from '@plataforma/contracts';

export class ObjetivoCreateDto extends createZodDto(objetivoVendedorMesCreateSchema) {}
export class ObjetivoUpdateDto extends createZodDto(objetivoVendedorMesUpdateSchema) {}
export class ObjetivoQueryDto extends createZodDto(objetivoVendedorMesQuerySchema) {}
export class ObjetivoDashboardQueryDto extends createZodDto(objetivoDashboardQuerySchema) {}
export class ObjetivoCopiarPeriodoDto extends createZodDto(objetivoCopiarPeriodoSchema) {}
export class DashboardGerencialQueryDto extends createZodDto(
  dashboardGerencialQuerySchema,
) {}
export class DashboardGerencialVendedorQueryDto extends createZodDto(
  dashboardGerencialVendedorQuerySchema,
) {}
export class ObjetivoDashboardMunicipiosQueryDto extends createZodDto(
  objetivoDashboardMunicipiosQuerySchema,
) {}
