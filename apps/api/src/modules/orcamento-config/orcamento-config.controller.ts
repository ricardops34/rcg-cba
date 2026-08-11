import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ORCAMENTO_CONFIG_EXAMPLE } from '@plataforma/contracts';
import { OrcamentoConfigService } from './orcamento-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
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
    summary: 'Consultar a validade de orçamento vigente',
    description:
      'Lê o parâmetro ORCAMENTO_DIAS_VALIDADE da empresa ativa. Qualquer usuário autenticado ' +
      'pode consultar — o próprio formulário de Orçamento usa isso para sugerir a "Válido até", ' +
      'e o vendedor não tem acesso à tela de Parâmetros. Não colocar @RequirePermission aqui. ' +
      'A edição do valor é feita em Administração > Parâmetros.',
  })
  @ApiResponse({ status: 200, schema: { example: ORCAMENTO_CONFIG_EXAMPLE } })
  @UseGuards(JwtAuthGuard)
  @Get()
  getVigente(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getVigente(user.empresaAtivaId);
  }
}
