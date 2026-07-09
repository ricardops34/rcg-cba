import { createZodDto } from 'nestjs-zod';
import { clienteCreateSchema, clienteUpdateSchema } from '@plataforma/contracts';

export class ClienteCreateDto extends createZodDto(clienteCreateSchema) {}
export class ClienteUpdateDto extends createZodDto(clienteUpdateSchema) {}
