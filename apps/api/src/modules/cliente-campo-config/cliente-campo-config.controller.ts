import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CLIENTE_CAMPOS_CONFIG_UPDATE_EXAMPLE } from '@plataforma/contracts';
import { ClienteCampoConfigService } from './cliente-campo-config.service';
import { ClienteCamposConfigUpdateDto } from './dto/cliente-campo-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('clientes-config')
@ApiBearerAuth()
@Controller('clientes-config')
export class ClienteCampoConfigController {
  constructor(private readonly service: ClienteCampoConfigService) {}

  @ApiOperation({
    summary:
      'Consultar quais campos do cadastro de Cliente podem ser alterados',
    description:
      'Qualquer usuário autenticado pode consultar — o próprio formulário de Cliente usa isso ' +
      'para saber quais campos desabilitar. Campo sem configuração prévia é considerado ' +
      'editável. Não colocar @RequirePermission aqui.',
  })
  @UseGuards(JwtAuthGuard)
  @Get('campos')
  obterConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.service.obterConfig(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Definir quais campos do cadastro de Cliente podem ser alterados',
    description: 'Requer clientes-config.editar.',
  })
  @ApiBodyExample(CLIENTE_CAMPOS_CONFIG_UPDATE_EXAMPLE)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('clientes-config', 'editar')
  @Patch('campos')
  atualizar(
    @Body() dto: ClienteCamposConfigUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizar(user.empresaAtivaId, user.id, dto.campos);
  }
}
