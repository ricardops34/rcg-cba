import { createZodDto } from 'nestjs-zod';
import {
  resetPasswordSchema,
  usuarioCreateSchema,
  usuarioEmpresaCreateSchema,
  usuarioHorariosUpdateSchema,
  usuarioQuerySchema,
  usuarioUpdateSchema,
} from '@plataforma/contracts';

export class UsuarioCreateDto extends createZodDto(usuarioCreateSchema) {}
export class UsuarioUpdateDto extends createZodDto(usuarioUpdateSchema) {}
export class UsuarioQueryDto extends createZodDto(usuarioQuerySchema) {}
export class UsuarioEmpresaCreateDto extends createZodDto(
  usuarioEmpresaCreateSchema,
) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class UsuarioHorariosUpdateDto extends createZodDto(
  usuarioHorariosUpdateSchema,
) {}
