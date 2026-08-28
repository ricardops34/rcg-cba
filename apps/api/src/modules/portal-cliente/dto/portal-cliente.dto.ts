import { createZodDto } from 'nestjs-zod';
import {
  portalClienteConfigSchema,
  portalClienteContatoCreateSchema,
  portalClienteHabilitarSchema,
  portalClienteLoginSchema,
  portalClienteRefreshSchema,
} from '@plataforma/contracts';

export class PortalClienteConfigDto extends createZodDto(portalClienteConfigSchema) {}
export class PortalClienteContatoCreateDto extends createZodDto(portalClienteContatoCreateSchema) {}
export class PortalClienteHabilitarDto extends createZodDto(portalClienteHabilitarSchema) {}
export class PortalClienteLoginDto extends createZodDto(portalClienteLoginSchema) {}
export class PortalClienteRefreshDto extends createZodDto(portalClienteRefreshSchema) {}
