import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConferirConteudoUploadInterceptor } from '../../common/uploads/conferir-conteudo.interceptor';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AUTH_TOKENS_EXAMPLE,
  CURRENT_USER_EXAMPLE,
  EMPRESA_BRANDING_EXAMPLE,
  LOGIN_EXAMPLE,
} from '@plataforma/contracts';
import { AuthService } from './auth.service';
import {
  AvatarPadraoDto,
  ChangePasswordDto,
  CompleteFirstAccessDto,
  LoginDto,
  RefreshDto,
  SwitchEmpresaDto,
  UpdateOwnProfileDto,
  UpdateRotinaInicialDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PermitirTermoPendente } from '../../common/decorators/permitir-termo-pendente.decorator';
import {
  COOKIE_REFRESH,
  gravarCookieRefresh,
  lerCookie,
  limparCookieRefresh,
} from '../../common/auth/cookie-refresh';

const REFRESH_EXAMPLE = { refreshToken: AUTH_TOKENS_EXAMPLE.refreshToken };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  /**
   * Grava o refresh token no cookie `HttpOnly` e **o tira do corpo** (SEC-11):
   * o que o JavaScript da página recebe não inclui o token que vale por dias.
   * O front e a API publicam juntos — front anterior esperava o token no corpo.
   */
  private comCookie<T extends { refreshToken?: string }>(
    res: Response,
    resultado: T,
  ): Omit<T, 'refreshToken'> {
    const { refreshToken, ...resto } = resultado;
    if (refreshToken) gravarCookieRefresh(res, refreshToken);
    return resto;
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
  // Throttle por IP mais rígido que o default global (200/min) — o lockout de
  // conta (tentativasFalhas/bloqueadoAte, ver PoliticaSenhaService) já cobre
  // força bruta contra uma única conta, mas não contra credential stuffing
  // espalhado por muitas contas a partir do mesmo IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.comCookie(res, await this.authService.login(dto, this.meta(req)));
  }

  @ApiOperation({
    summary: 'Branding público da empresa por alias',
    description:
      'Endpoint público (sem autenticação) usado pela tela de login para exibir ' +
      'logo e nome da empresa a partir do alias informado na URL (?empresa=<alias>). ' +
      'Retorna 404 se não houver empresa ativa com esse alias.',
  })
  @ApiResponse({ status: 200, schema: { example: EMPRESA_BRANDING_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  @Get('empresa-branding')
  empresaBranding(@Query('alias') alias: string) {
    return this.authService.empresaBranding(alias ?? '');
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
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = dto.refreshToken ?? lerCookie(req, COOKIE_REFRESH);
    if (!refreshToken) throw new UnauthorizedException('Refresh token ausente');
    try {
      return this.comCookie(
        res,
        await this.authService.refresh({ refreshToken }, this.meta(req)),
      );
    } catch (erro) {
      // Token inválido, vencido ou de sessão encerrada: o cookie não serve
      // mais, e deixá-lo faria o navegador repetir a tentativa à toa.
      if (erro instanceof UnauthorizedException) limparCookieRefresh(res);
      throw erro;
    }
  }

  @ApiOperation({
    summary: 'Logout',
    description: 'Revoga o refresh token informado. O access token expira sozinho em até 15 minutos.',
  })
  @ApiBodyExample(REFRESH_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = dto.refreshToken ?? lerCookie(req, COOKIE_REFRESH);
    limparCookieRefresh(res);
    if (!refreshToken) return { success: true };
    return this.authService.logout({ refreshToken });
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
  @PermitirTermoPendente()
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
  @PermitirTermoPendente()
  @Post('switch-empresa')
  async switchEmpresa(
    @Body() dto: SwitchEmpresaDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.comCookie(
      res,
      await this.authService.switchEmpresa(user.id, dto.empresaId, this.meta(req), user.sessaoId),
    );
  }

  @ApiOperation({
    summary: 'Entrar como suporte no ambiente de um cliente',
    description:
      'Para administradores da plataforma (Plataforma > Empresas). Emite um par de tokens com a empresa do ' +
      'cliente como ativa, sem vínculo, enquanto a liberação de suporte dele estiver vigente. Toda ação da ' +
      'sessão vai para o log de suporte que o cliente lê. 403 sem liberação.',
  })
  @ApiResponse({ status: 201, schema: { example: AUTH_TOKENS_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'O cliente não liberou o suporte' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @Post('suporte/:empresaId')
  async entrarComoSuporte(
    @Param('empresaId') empresaId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.comCookie(
      res,
      await this.authService.entrarComoSuporte(
        user.id,
        empresaId,
        this.meta(req),
        user.sessaoId,
      ),
    );
  }

  @ApiOperation({
    summary: 'Trocar a própria senha',
    description:
      'Troca a senha do usuário logado. Exige a senha atual e valida a nova contra a ' +
      'política de senha vigente (GET /politica-senha) e o histórico de reuso.',
  })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 401, description: 'Senha atual incorreta' })
  @ApiResponse({ status: 400, description: 'Nova senha não atende à política vigente' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @PermitirTermoPendente()
  @Patch('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.changePassword(user.id, dto);
  }

  @ApiOperation({ summary: 'Confirmar os dados do primeiro acesso e sincronizar o vendedor vinculado' })
  @ApiResponse({ status: 200, description: 'Dados confirmados' })
  @ApiResponse({ status: 400, description: 'Dados obrigatórios inválidos' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/primeiro-acesso')
  completeFirstAccess(@Body() dto: CompleteFirstAccessDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.completeFirstAccess(user.id, user.empresaAtivaId, dto);
  }

  @ApiOperation({ summary: 'Enviar fotografia do próprio perfil (PNG, JPEG ou WEBP, até 2 MB)' })
  @ApiResponse({ status: 201, description: 'Fotografia atualizada' })
  @ApiResponse({ status: 400, description: 'Fotografia inválida' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('me/foto')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }), ConferirConteudoUploadInterceptor)
  uploadPhoto(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.uploadOwnAvatar(user.id, user.empresaAtivaId, file);
  }

  @ApiOperation({ summary: 'Escolher um avatar corporativo padrão para o próprio perfil' })
  @ApiResponse({ status: 200, description: 'Avatar atualizado' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/avatar-padrao')
  selectDefaultAvatar(@Body() dto: AvatarPadraoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.selectDefaultAvatar(user.id, user.empresaAtivaId, dto.avatar);
  }

  @ApiOperation({ summary: 'Alterar nome e número de telefone do próprio usuário' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Body() dto: UpdateOwnProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.updateOwnProfile(
      user.id,
      user.empresaAtivaId,
      dto.nome,
      dto.whatsapp,
      dto.dataNascimento,
      dto.nomeWhatsapp,
      dto.usarNomeWhatsapp,
    );
  }

  @ApiOperation({
    summary: 'Escolher a própria tela inicial',
    description:
      'Grava, para a empresa ativa, a rotina que abre ao entrar. Só aceita rotina que o usuário ' +
      "enxerga (permissão '<rotina>.visualizar') e que tenha tela. rotinaId null volta para a " +
      'rotina inicial do perfil.',
  })
  @ApiBodyExample({ rotinaId: null })
  @ApiResponse({ status: 400, description: 'Rotina sem acesso ou sem tela' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/rotina-inicial')
  updateRotinaInicial(
    @Body() dto: UpdateRotinaInicialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.updateRotinaInicial(
      user.id,
      user.empresaAtivaId,
      dto.rotinaId,
    );
  }
}
