import { createZodDto } from 'nestjs-zod';
import {
  clienteAlteracaoAprovacaoSchema,
  clienteAlteracaoAprovarVaziosSchema,
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
export class ClienteAlteracaoAprovarVaziosDto extends createZodDto(
  clienteAlteracaoAprovarVaziosSchema,
) {}
