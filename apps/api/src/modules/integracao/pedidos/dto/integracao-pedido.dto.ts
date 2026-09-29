import { createZodDto } from 'nestjs-zod';
import {
  integracaoPedidoCreateSchema,
  integracaoPedidoLoteSchema,
} from '@plataforma/contracts';

export class IntegracaoPedidoCreateDto extends createZodDto(
  integracaoPedidoCreateSchema,
) {}

export class IntegracaoPedidoLoteDto extends createZodDto(
  integracaoPedidoLoteSchema,
) {}
