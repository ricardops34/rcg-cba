import { createZodDto } from 'nestjs-zod';
import { estoqueQuerySchema } from '@plataforma/contracts';

export class EstoqueQueryDto extends createZodDto(estoqueQuerySchema) {}
