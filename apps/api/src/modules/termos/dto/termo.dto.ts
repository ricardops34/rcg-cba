import { createZodDto } from 'nestjs-zod';
import { termoAceiteInputSchema } from '@plataforma/contracts';

export class TermoAceiteDto extends createZodDto(termoAceiteInputSchema) {}

