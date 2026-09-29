import { createZodDto } from 'nestjs-zod';
import {
  integracaoCargaErrosQuerySchema,
  integracaoCargaLimparSchema,
  integracaoCargaListaQuerySchema,
  integracaoCargaProcessarSchema,
  integracaoCargaReprocessarSchema,
} from '@plataforma/contracts';

export class IntegracaoCargaErrosQueryDto extends createZodDto(
  integracaoCargaErrosQuerySchema,
) {}

export class IntegracaoCargaProcessarDto extends createZodDto(
  integracaoCargaProcessarSchema,
) {}

export class IntegracaoCargaListaQueryDto extends createZodDto(
  integracaoCargaListaQuerySchema,
) {}

export class IntegracaoCargaReprocessarDto extends createZodDto(
  integracaoCargaReprocessarSchema,
) {}

export class IntegracaoCargaLimparDto extends createZodDto(
  integracaoCargaLimparSchema,
) {}
