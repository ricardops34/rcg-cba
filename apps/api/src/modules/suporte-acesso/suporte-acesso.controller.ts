import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { SuporteAcessoService } from './suporte-acesso.service';

@ApiTags('suporte-acesso')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suporte-acesso')
export class SuporteAcessoController {
  constructor(private readonly service: SuporteAcessoService) {}

  @ApiOperation({ summary: 'Consultar acesso de suporte ativo da empresa' })
  @Get('ativo')
  getAcessoAtivo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getAcessoAtivo(user.empresaAtivaId);
  }

  @ApiOperation({ summary: 'Conceder liberação temporária de acesso para suporte' })
  @RequirePermission('empresa', 'editar')
  @Post('conceder')
  concederAcesso(
    @Body() dto: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.concederAcesso(user.empresaAtivaId, dto, user.id);
  }

  @ApiOperation({ summary: 'Revogar liberação de acesso de suporte' })
  @RequirePermission('empresa', 'editar')
  @Post('revogar/:id')
  revogarAcesso(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.revogarAcesso(user.empresaAtivaId, id, user.id);
  }

  @ApiOperation({ summary: 'Histórico de concessões de suporte da empresa' })
  @Get('historico')
  listHistorico(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listHistorico(user.empresaAtivaId);
  }

  @ApiOperation({ summary: 'Log de auditoria das ações do suporte no ambiente' })
  @Get('logs')
  listLogs(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listLogs(user.empresaAtivaId);
  }
}
