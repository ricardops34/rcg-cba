import { createZodDto } from 'nestjs-zod';
import { clienteCreateSchema, clienteQuerySchema, clienteUpdateSchema } from '@plataforma/contracts';

export class ClienteCreateDto extends createZodDto(clienteCreateSchema) {}
export class ClienteUpdateDto extends createZodDto(clienteUpdateSchema) {}
export class ClienteQueryDto extends createZodDto(clienteQuerySchema) {}
