import { createZodDto } from 'nestjs-zod';
import { fornecedorQuerySchema } from '@plataforma/contracts';

export class FornecedorQueryDto extends createZodDto(fornecedorQuerySchema) {}
