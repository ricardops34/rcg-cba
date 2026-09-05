import { createZodDto } from 'nestjs-zod';
import {
  erroClienteReportSchema,
  erroLogConfigUpdateSchema,
  erroLogOcorrenciaQuerySchema,
  erroLogQuerySchema,
} from '@plataforma/contracts';

export class ErroLogQueryDto extends createZodDto(erroLogQuerySchema) {}
export class ErroLogOcorrenciaQueryDto extends createZodDto(
  erroLogOcorrenciaQuerySchema,
) {}
export class ErroClienteReportDto extends createZodDto(
  erroClienteReportSchema,
) {}
export class ErroLogConfigUpdateDto extends createZodDto(
  erroLogConfigUpdateSchema,
) {}
