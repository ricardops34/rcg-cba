import { createZodDto } from 'nestjs-zod';
import {
  clienteCreateSchema,
  clienteQuerySchema,
  clienteUpdateSchema,
  posicaoClienteListQuerySchema,
} from '@plataforma/contracts';

export class ClienteCreateDto extends createZodDto(clienteCreateSchema) {}
export class ClienteUpdateDto extends createZodDto(clienteUpdateSchema) {}
export class ClienteQueryDto extends createZodDto(clienteQuerySchema) {}
export class PosicaoClienteListQueryDto extends createZodDto(posicaoClienteListQuerySchema) {}
