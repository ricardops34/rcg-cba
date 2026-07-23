import { createZodDto } from 'nestjs-zod';
import { vendedorCreateSchema, vendedorQuerySchema, vendedorUpdateSchema } from '@plataforma/contracts';

export class VendedorCreateDto extends createZodDto(vendedorCreateSchema) {}
export class VendedorUpdateDto extends createZodDto(vendedorUpdateSchema) {}
export class VendedorQueryDto extends createZodDto(vendedorQuerySchema) {}
