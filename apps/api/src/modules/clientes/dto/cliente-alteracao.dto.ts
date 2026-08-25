import { createZodDto } from 'nestjs-zod';
import {
  clienteAlteracaoAprovacaoSchema,
  clienteAlteracaoQuerySchema,
  clienteAlteracaoRecusaSchema,
} from '@plataforma/contracts';

export class ClienteAlteracaoQueryDto extends createZodDto(
  clienteAlteracaoQuerySchema,
) {}
export class ClienteAlteracaoAprovacaoDto extends createZodDto(
  clienteAlteracaoAprovacaoSchema,
) {}
export class ClienteAlteracaoRecusaDto extends createZodDto(
  clienteAlteracaoRecusaSchema,
) {}
