import { createZodDto } from 'nestjs-zod';
import {
  enviarBoletoEmailSchema,
  enviarNotaEmailSchema,
} from '@plataforma/contracts';

export class EnviarNotaEmailDto extends createZodDto(enviarNotaEmailSchema) {}
export class EnviarBoletoEmailDto extends createZodDto(
  enviarBoletoEmailSchema,
) {}
