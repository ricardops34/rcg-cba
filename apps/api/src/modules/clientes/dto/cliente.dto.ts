import { createZodDto } from 'nestjs-zod';
import {
  clienteCreateSchema,
  clienteQuerySchema,
  clienteUpdateSchema,
  posicaoClienteListQuerySchema,
  vendedoresEscopoQuerySchema,
} from '@plataforma/contracts';

export class ClienteCreateDto extends createZodDto(clienteCreateSchema) {}
export class ClienteUpdateDto extends createZodDto(clienteUpdateSchema) {}
export class ClienteQueryDto extends createZodDto(clienteQuerySchema) {}
export class PosicaoClienteListQueryDto extends createZodDto(
  posicaoClienteListQuerySchema,
) {}
export class VendedoresEscopoQueryDto extends createZodDto(
  vendedoresEscopoQuerySchema,
) {}
