import { createZodDto } from 'nestjs-zod';
import {
  authTokensSchema,
  currentUserSchema,
  loginSchema,
  refreshInputSchema,
  switchEmpresaInputSchema,
} from '@plataforma/contracts';

export class LoginDto extends createZodDto(loginSchema) {}
export class RefreshDto extends createZodDto(refreshInputSchema) {}
export class AuthTokensDto extends createZodDto(authTokensSchema) {}
export class CurrentUserDto extends createZodDto(currentUserSchema) {}
export class SwitchEmpresaDto extends createZodDto(switchEmpresaInputSchema) {}
