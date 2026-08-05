import { createZodDto } from 'nestjs-zod';
import { clienteCamposConfigUpdateSchema } from '@plataforma/contracts';

export class ClienteCamposConfigUpdateDto extends createZodDto(
  clienteCamposConfigUpdateSchema,
) {}
