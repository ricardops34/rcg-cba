import { createZodDto } from 'nestjs-zod';
import {
  integracaoCargaErrosQuerySchema,
  integracaoCargaProcessarSchema,
} from '@plataforma/contracts';

export class IntegracaoCargaErrosQueryDto extends createZodDto(
  integracaoCargaErrosQuerySchema,
) {}

export class IntegracaoCargaProcessarDto extends createZodDto(
  integracaoCargaProcessarSchema,
) {}
