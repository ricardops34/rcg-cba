import { createZodDto } from 'nestjs-zod';
import {
  enviarBoletoSmsSchema,
  enviarSmsClienteSchema,
  smsConfiguracaoUpdateSchema,
  smsFiltroSchema,
} from '@plataforma/contracts';

export class EnviarBoletoSmsDto extends createZodDto(enviarBoletoSmsSchema) {}
export class EnviarSmsClienteDto extends createZodDto(enviarSmsClienteSchema) {}
export class SmsFiltroDto extends createZodDto(smsFiltroSchema) {}
export class SmsConfiguracaoUpdateDto extends createZodDto(
  smsConfiguracaoUpdateSchema,
) {}
