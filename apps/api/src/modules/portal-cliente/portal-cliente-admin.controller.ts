import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PortalClienteConfigDto, PortalClienteContatoCreateDto } from './dto/portal-cliente.dto';
import { PortalClienteAdminService } from './portal-cliente-admin.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('portal-cliente-admin')
export class PortalClienteAdminController {
  constructor(private readonly admin: PortalClienteAdminService) {}

  @Get('config')
  @RequirePermission('clientes', 'visualizar')
  config(@CurrentUser() user: AuthenticatedUser) {
    return this.admin.obterConfig(user.empresaAtivaId);
  }

  @Put('config')
  @RequirePermission('clientes', 'editar')
  salvarConfig(@CurrentUser() user: AuthenticatedUser, @Body() dto: PortalClienteConfigDto) {
    return this.admin.salvarConfig(user.empresaAtivaId, dto, user.id);
  }

  @Post('acessos')
  @RequirePermission('clientes', 'editar')
  criarAcesso(@CurrentUser() user: AuthenticatedUser, @Body() dto: PortalClienteContatoCreateDto) {
    return this.admin.criarAcesso(user.empresaAtivaId, dto, user.id);
  }
}
