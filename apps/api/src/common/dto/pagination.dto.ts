import { createZodDto } from 'nestjs-zod';
import { paginationQuerySchema } from '@plataforma/contracts';

export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
