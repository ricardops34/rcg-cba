import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  EmailConfiguracao,
  EmailModelosConfiguracao,
  EmailTesteResultado,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { EmailConfigService } from './email-config.service';
import {
  EmailConfiguracaoUpdateDto,
  EmailModelosUpdateDto,
  EmailModeloRestaurarDto,
  EmailModeloTesteDto,
} from './email-config.dto';

/**
 * Administração > E-mail: parâmetros SMTP, funcionalidades, modelos de e-mail e identidade visual.
 */
@ApiTags('email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('email')
export class EmailConfigController {
  constructor(private readonly service: EmailConfigService) {}

  @ApiOperation({
    summary: 'Configuração do e-mail (parâmetros SMTP_* e EMAIL_*)',
    description:
      'Sem a senha do SMTP — só se ela está preenchida. Requer email.visualizar.',
  })
  @RequirePermission('email', 'visualizar')
  @Get('configuracao')
  configuracao(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmailConfiguracao> {
    return this.service.configuracao(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Gravar a configuração do e-mail',
    description:
      'A senha do SMTP só é trocada quando vem preenchida. Requer email.editar.',
  })
  @RequirePermission('email', 'editar')
  @Put('configuracao')
  async salvar(
    @Body() dto: EmailConfiguracaoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmailConfiguracao> {
    await this.service.salvar(user.empresaAtivaId, user.id, dto);
    return this.service.configuracao(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Enviar e-mail de teste de conexão para o próprio usuário',
    description:
      'Usa a configuração gravada, mesmo com o envio desligado. Requer email.editar.',
  })
  @RequirePermission('email', 'editar')
  @HttpCode(200)
  @Post('teste')
  teste(@CurrentUser() user: AuthenticatedUser) {
    return this.service.enviarTeste(user.empresaAtivaId, user.email);
  }

  @ApiOperation({
    summary: 'O que de e-mail está disponível para a tela',
  })
  @Get('disponivel')
  disponivel(@CurrentUser() user: AuthenticatedUser) {
    return this.service.disponibilidade(user.empresaAtivaId);
  }

  // -------------------------------------------------------------------------
  // Modelos de E-mail e Identidade Visual
  // -------------------------------------------------------------------------

  @ApiOperation({
    summary: 'Obter modelos de e-mail e configurações de identidade visual',
  })
  @RequirePermission('email', 'visualizar')
  @Get('modelos')
  obterModelos(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmailModelosConfiguracao> {
    return this.service.obterModelos(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Salvar modelos personalizados de e-mail e identidade visual',
  })
  @RequirePermission('email', 'editar')
  @Put('modelos')
  salvarModelos(
    @Body() dto: EmailModelosUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmailModelosConfiguracao> {
    return this.service.salvarModelos(user.empresaAtivaId, user.id, dto);
  }

  @ApiOperation({
    summary: 'Restaurar modelos para o padrão do sistema',
  })
  @RequirePermission('email', 'editar')
  @HttpCode(200)
  @Post('modelos/restaurar')
  restaurarModelos(
    @Body() dto: EmailModeloRestaurarDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmailModelosConfiguracao> {
    return this.service.restaurarModelos(user.empresaAtivaId, user.id, dto.tipo);
  }

  @ApiOperation({
    summary: 'Disparar e-mail de teste com modelo renderizado e dados de exemplo',
  })
  @RequirePermission('email', 'editar')
  @HttpCode(200)
  @Post('modelos/teste')
  testarModelo(
    @Body() dto: EmailModeloTesteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmailTesteResultado> {
    return this.service.enviarTesteModelo(user.empresaAtivaId, user, dto);
  }
}

