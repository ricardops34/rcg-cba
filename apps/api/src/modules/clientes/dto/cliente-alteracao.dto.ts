import { createZodDto } from 'nestjs-zod';
import {
  clienteAlteracaoQuerySchema,
  clienteAlteracaoRecusaSchema,
} from '@plataforma/contracts';

export class ClienteAlteracaoQueryDto extends createZodDto(
  clienteAlteracaoQuerySchema,
) {}
export class ClienteAlteracaoRecusaDto extends createZodDto(
  clienteAlteracaoRecusaSchema,
) {}
