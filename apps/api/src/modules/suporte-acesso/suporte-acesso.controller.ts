import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { SuporteAcessoService } from './suporte-acesso.service';
import { createZodDto } from 'nestjs-zod';
import { concederSuporteSchema } from '@plataforma/contracts';

// Antes `any`: sem o contrato, `duracaoHoras` em texto concatenava com a hora
// atual e a liberação durava meses; o limite de 72 h não valia.
class ConcederSuporteDto extends createZodDto(concederSuporteSchema) {}

/**
 * Liberação de suporte (Administração > Liberação de Suporte), da empresa
 * ativa. Rotina `suporte-acesso` — antes as rotas pediam `empresa.editar`,
 * código que não existe no catálogo, e as leituras não pediam nada.
 */

@ApiTags('suporte-acesso')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suporte-acesso')
export class SuporteAcessoController {
  constructor(private readonly service: SuporteAcessoService) {}

  @ApiOperation({ summary: 'Consultar acesso de suporte ativo da empresa' })
  @RequirePermission('suporte-acesso', 'visualizar')
  @Get('ativo')
  getAcessoAtivo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getAcessoAtivo(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Conceder liberação temporária de acesso para suporte',
  })
  @RequirePermission('suporte-acesso', 'editar')
  @Post('conceder')
  concederAcesso(
    @Body() dto: ConcederSuporteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.concederAcesso(user.empresaAtivaId, dto, user.id);
  }

  @ApiOperation({ summary: 'Revogar liberação de acesso de suporte' })
  @RequirePermission('suporte-acesso', 'editar')
  @Post('revogar/:id')
  revogarAcesso(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.revogarAcesso(user.empresaAtivaId, id, user.id);
  }

  @ApiOperation({ summary: 'Histórico de concessões de suporte da empresa' })
  @RequirePermission('suporte-acesso', 'visualizar')
  @Get('historico')
  listHistorico(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listHistorico(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Log de auditoria das ações do suporte no ambiente',
  })
  @RequirePermission('suporte-acesso', 'visualizar')
  @Get('logs')
  listLogs(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listLogs(user.empresaAtivaId);
  }
}
