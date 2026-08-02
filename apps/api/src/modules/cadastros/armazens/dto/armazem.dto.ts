import { createZodDto } from 'nestjs-zod';
import { armazemQuerySchema } from '@plataforma/contracts';

export class ArmazemQueryDto extends createZodDto(armazemQuerySchema) {}
