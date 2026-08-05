import { createZodDto } from 'nestjs-zod';
import { orcamentoConfigUpdateSchema } from '@plataforma/contracts';

export class OrcamentoConfigUpdateDto extends createZodDto(orcamentoConfigUpdateSchema) {}
