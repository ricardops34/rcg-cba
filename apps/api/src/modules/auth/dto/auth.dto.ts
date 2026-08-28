import { createZodDto } from 'nestjs-zod';
import {
  authTokensSchema,
  changePasswordSchema,
  currentUserSchema,
  loginSchema,
  refreshInputSchema,
  switchEmpresaInputSchema,
  updateOwnProfileSchema,
} from '@plataforma/contracts';

export class LoginDto extends createZodDto(loginSchema) {}
export class RefreshDto extends createZodDto(refreshInputSchema) {}
export class AuthTokensDto extends createZodDto(authTokensSchema) {}
export class CurrentUserDto extends createZodDto(currentUserSchema) {}
export class SwitchEmpresaDto extends createZodDto(switchEmpresaInputSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class UpdateOwnProfileDto extends createZodDto(updateOwnProfileSchema) {}
