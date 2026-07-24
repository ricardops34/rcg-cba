import { createZodDto } from 'nestjs-zod';
import { tituloReceberQuerySchema } from '@plataforma/contracts';

export class TituloReceberQueryDto extends createZodDto(tituloReceberQuerySchema) {}
