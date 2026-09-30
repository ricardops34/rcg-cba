import { createZodDto } from 'nestjs-zod';
import {
  avatarPadraoSchema,
  authTokensSchema,
  changePasswordSchema,
  currentUserSchema,
  loginSchema,
  refreshInputSchema,
  switchEmpresaInputSchema,
  updateOwnProfileSchema,
  updateRotinaInicialSchema,
  completeFirstAccessSchema,
} from '@plataforma/contracts';

export class LoginDto extends createZodDto(loginSchema) {}
export class RefreshDto extends createZodDto(refreshInputSchema) {}
export class AuthTokensDto extends createZodDto(authTokensSchema) {}
export class CurrentUserDto extends createZodDto(currentUserSchema) {}
export class SwitchEmpresaDto extends createZodDto(switchEmpresaInputSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class UpdateOwnProfileDto extends createZodDto(updateOwnProfileSchema) {}
export class UpdateRotinaInicialDto extends createZodDto(updateRotinaInicialSchema) {}
export class CompleteFirstAccessDto extends createZodDto(completeFirstAccessSchema) {}
export class AvatarPadraoDto extends createZodDto(avatarPadraoSchema) {}
