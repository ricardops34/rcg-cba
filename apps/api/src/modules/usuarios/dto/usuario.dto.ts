import { createZodDto } from 'nestjs-zod';
import {
  usuarioCreateSchema,
  usuarioEmpresaCreateSchema,
  usuarioUpdateSchema,
} from '@plataforma/contracts';

export class UsuarioCreateDto extends createZodDto(usuarioCreateSchema) {}
export class UsuarioUpdateDto extends createZodDto(usuarioUpdateSchema) {}
export class UsuarioEmpresaCreateDto extends createZodDto(
  usuarioEmpresaCreateSchema,
) {}
