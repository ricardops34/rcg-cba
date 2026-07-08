import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  AUTH_TOKENS_EXAMPLE,
  CURRENT_USER_EXAMPLE,
  LOGIN_EXAMPLE,
} from '@plataforma/contracts';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SwitchEmpresaDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

const REFRESH_EXAMPLE = { refreshToken: AUTH_TOKENS_EXAMPLE.refreshToken };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  @ApiOperation({
    summary: 'Login',
    description:
      'Autentica com e-mail e senha e retorna o par de tokens (access + refresh). ' +
      'O usuário é logado automaticamente na primeira empresa ativa vinculada a ele.',
  })
  @ApiBodyExample(LOGIN_EXAMPLE)
  @ApiResponse({
    status: 200,
    description: 'Login efetuado com sucesso',
    schema: { example: AUTH_TOKENS_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas ou usuário sem empresa ativa' })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.meta(req));
  }

  @ApiOperation({
    summary: 'Renovar tokens',
    description:
      'Troca um refresh token válido por um novo par de tokens (rotação). ' +
      'O refresh token usado é imediatamente revogado, mesmo em caso de reuso indevido.',
  })
  @ApiBodyExample(REFRESH_EXAMPLE)
  @ApiResponse({
    status: 200,
    description: 'Novo par de tokens emitido',
    schema: { example: AUTH_TOKENS_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, expirado ou já revogado' })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto, this.meta(req));
  }

  @ApiOperation({
    summary: 'Logout',
    description: 'Revoga o refresh token informado. O access token expira sozinho em até 15 minutos.',
  })
  @ApiBodyExample(REFRESH_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto);
  }

  @ApiOperation({
    summary: 'Usuário autenticado',
    description:
      'Retorna os dados do usuário logado: empresas vinculadas, perfil ativo e a lista ' +
      "de permissões da empresa ativa, no formato 'rotinaCodigo.acao'.",
  })
  @ApiResponse({ status: 200, schema: { example: CURRENT_USER_EXAMPLE } })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id, user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Trocar empresa ativa',
    description:
      'Emite um novo par de tokens com outra empresa ativa, para usuários vinculados a mais de uma empresa. ' +
      'Falha com 403 se o usuário não tiver vínculo ativo com a empresa informada.',
  })
  @ApiBodyExample({ empresaId: CURRENT_USER_EXAMPLE.empresaAtivaId })
  @ApiResponse({ status: 201, schema: { example: AUTH_TOKENS_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'Usuário não tem acesso a esta empresa' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('switch-empresa')
  switchEmpresa(
    @Body() dto: SwitchEmpresaDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.authService.switchEmpresa(user.id, dto.empresaId, this.meta(req));
  }
}
