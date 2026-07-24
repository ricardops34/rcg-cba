import { createZodDto } from 'nestjs-zod';
import { municipioCreateSchema, municipioQuerySchema, municipioUpdateSchema } from '@plataforma/contracts';

export class MunicipioCreateDto extends createZodDto(municipioCreateSchema) {}
export class MunicipioUpdateDto extends createZodDto(municipioUpdateSchema) {}
export class MunicipioQueryDto extends createZodDto(municipioQuerySchema) {}
