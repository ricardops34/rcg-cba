import { createZodDto } from 'nestjs-zod';
import {
  acessoQuerySchema,
  usuarioHorariosUpdateSchema,
} from '@plataforma/contracts';

export class AcessoQueryDto extends createZodDto(acessoQuerySchema) {}
export class UsuarioHorariosUpdateDto extends createZodDto(
  usuarioHorariosUpdateSchema,
) {}
