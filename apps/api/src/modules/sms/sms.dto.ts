import { createZodDto } from 'nestjs-zod';
import {
  enviarBoletoSmsSchema,
  enviarSmsClienteSchema,
  smsFiltroSchema,
} from '@plataforma/contracts';

export class EnviarBoletoSmsDto extends createZodDto(enviarBoletoSmsSchema) {}
export class EnviarSmsClienteDto extends createZodDto(enviarSmsClienteSchema) {}
export class SmsFiltroDto extends createZodDto(smsFiltroSchema) {}
