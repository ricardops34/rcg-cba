import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EscopoService } from './escopo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

// Sem PermissionsGuard: o endpoint devolve só id/nome de vendedores já
// restritos ao escopo do próprio usuário — informação de baixa sensibilidade
// usada pelos filtros de várias rotinas (notas, itens, títulos), que não
// deveria exigir permissão numa rotina específica.
@ApiTags('escopo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('escopo')
export class EscopoController {
  constructor(private readonly service: EscopoService) {}

  @ApiOperation({
    summary: 'Vendedores no escopo do usuário logado',
    description:
      'Opções de vendedor (id/nome) para filtros de telas escopadas, já restritas ao escopo ' +
      'hierárquico do usuário. restrito=false indica acesso total.',
  })
  @Get('vendedores')
  vendedores(@CurrentUser() user: AuthenticatedUser) {
    return this.service.vendedores(user.empresaAtivaId, user);
  }
}
