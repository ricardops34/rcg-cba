import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ORCAMENTO_CONFIG_EXAMPLE } from '@plataforma/contracts';
import { OrcamentoConfigService } from './orcamento-config.service';
import { OrcamentoConfigUpdateDto } from './dto/orcamento-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('orcamento-config')
@ApiBearerAuth()
@Controller('orcamento-config')
export class OrcamentoConfigController {
  constructor(private readonly service: OrcamentoConfigService) {}

  @ApiOperation({
    summary: 'Consultar o parâmetro de validade de orçamento vigente',
    description:
      'Qualquer usuário autenticado pode consultar — o próprio formulário de Orçamento usa isso ' +
      'para sugerir a "Válido até" ao criar. Não colocar @RequirePermission aqui.',
  })
  @ApiResponse({ status: 200, schema: { example: ORCAMENTO_CONFIG_EXAMPLE } })
  @UseGuards(JwtAuthGuard)
  @Get()
  getVigente(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getVigente(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Definir os dias de validade padrão do orçamento',
    description: 'Requer orcamento-config.editar.',
  })
  @ApiBodyExample({ diasValidade: 15 })
  @ApiResponse({ status: 200, schema: { example: ORCAMENTO_CONFIG_EXAMPLE } })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('orcamento-config', 'editar')
  @Patch()
  update(@Body() dto: OrcamentoConfigUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(user.empresaAtivaId, dto, user.id);
  }
}
