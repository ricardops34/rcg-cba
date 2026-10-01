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
import type { EmailConfiguracao } from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { EmailConfigService } from './email-config.service';
import { EmailConfiguracaoUpdateDto } from './email-config.dto';

/**
 * Administração > E-mail: os parâmetros SMTP_* e EMAIL_* juntos, o teste de
 * envio e o que a tela pode mostrar (mesmo desenho do SMS).
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
    summary: 'Enviar e-mail de teste para o próprio usuário',
    description:
      'Usa a configuração gravada, mesmo com o envio desligado. 502 com o erro do servidor de ' +
      'e-mail quando ele recusa. Requer email.editar.',
  })
  @RequirePermission('email', 'editar')
  @HttpCode(200)
  @Post('teste')
  teste(@CurrentUser() user: AuthenticatedUser) {
    return this.service.enviarTeste(user.empresaAtivaId, user.email);
  }

  @ApiOperation({
    summary: 'O que de e-mail está disponível para a tela',
    description:
      'Só booleanos: envio habilitado (EMAIL_ATIVO e servidor) e cada funcionalidade. É o que ' +
      'mostra ou esconde os botões de e-mail. Qualquer usuário autenticado.',
  })
  @Get('disponivel')
  disponivel(@CurrentUser() user: AuthenticatedUser) {
    return this.service.disponibilidade(user.empresaAtivaId);
  }
}
